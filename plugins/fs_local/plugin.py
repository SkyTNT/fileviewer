import os
import re
import json
import shutil
import threading
import time
import concurrent.futures
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from config import parse_path, build_entry_path, get_roots, validate_path

PLUGIN_ID = "fs_local"

# ── File type registry (populated in setup) ──────────────────────────────────
_file_type_registry = None

IMAGE_EXTENSIONS   = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}
PARQUET_EXTENSIONS = {".parquet"}
CSV_EXTENSIONS     = {".csv"}
JSON_EXTENSIONS    = {".json"}
JSONL_EXTENSIONS   = {".jsonl", ".ndjson"}
TEXT_EXTENSIONS    = {
    ".txt", ".md", ".rst", ".tex", ".log", ".ini", ".conf", ".cfg", ".env",
    ".yaml", ".yml", ".toml", ".xml", ".html", ".htm", ".css",
    ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".py", ".sh", ".bash", ".zsh", ".fish", ".sql", ".r",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cxx",
    ".java", ".kt", ".kts", ".scala", ".go", ".rs", ".swift",
    ".cs", ".vb", ".fs", ".rb", ".php", ".pl", ".lua",
    ".dart", ".ex", ".exs", ".erl",
    ".cmake", ".makefile", ".mk", ".dockerfile",
    ".gitignore", ".gitattributes", ".editorconfig",
    ".vue", ".svelte",
}
VIDEO_MIME_TYPES = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/x-m4v',
    '.ts': 'video/mp2t',
}
AUDIO_MIME_TYPES = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma',
}
ARCHIVE_EXTENSIONS = {".zip", ".tar", ".tgz", ".tbz2", ".txz"}
try:
    import py7zr as _py7zr  # noqa
    ARCHIVE_EXTENSIONS.add(".7z")
except ImportError:
    pass

_EXT_TO_TYPE: dict[str, str] = {
    ext: t
    for t, exts in [
        ("image",   IMAGE_EXTENSIONS),
        ("parquet", PARQUET_EXTENSIONS),
        ("csv",     CSV_EXTENSIONS),
        ("json",    JSON_EXTENSIONS),
        ("jsonl",   JSONL_EXTENSIONS),
        ("text",    TEXT_EXTENSIONS),
        ("video",   VIDEO_MIME_TYPES),
        ("audio",   AUDIO_MIME_TYPES),
        ("archive", ARCHIVE_EXTENSIONS),
    ]
    for ext in exts
}


def _get_file_type(path: Path) -> str:
    if path.is_dir():
        return "directory"
    name_lower = path.name.lower()
    for compound in (".tar.gz", ".tar.bz2", ".tar.xz"):
        if name_lower.endswith(compound):
            return "archive"
    return _EXT_TO_TYPE.get(path.suffix.lower(), "unknown")


@lru_cache(maxsize=4096)
def _image_dims(path: str, mtime: float) -> "tuple[int, int] | None":
    try:
        from PIL import Image
        with Image.open(path) as img:
            return img.size
    except Exception:
        return None


def _entry_info(p: Path, slug: "str | None", root: Path) -> dict:
    path_str = build_entry_path(p, slug, root)
    is_symlink = p.is_symlink()
    try:
        stat = p.stat()
        ftype = _get_file_type(p)
        info = {
            "name": p.name,
            "path": path_str,
            "type": ftype,
            "size": stat.st_size if p.is_file() else None,
            "modified": stat.st_mtime,
            "is_dir": p.is_dir(),
            "is_symlink": is_symlink,
            "extension": p.suffix.lower() if p.is_file() else None,
        }
        if ftype == "image" and p.is_file():
            dims = _image_dims(str(p), stat.st_mtime)
            if dims:
                info["img_w"], info["img_h"] = dims
        return info
    except (PermissionError, OSError):
        return {
            "name": p.name, "path": path_str, "type": "unknown",
            "size": None, "modified": None, "is_dir": False,
            "is_symlink": is_symlink, "extension": p.suffix.lower(),
        }


def _build_tree(p: Path, remaining: int, slug: "str | None", root: Path,
                sort_by: str = "name", sort_order: str = "asc") -> dict:
    node = _entry_info(p, slug, root)
    if p.is_dir() and remaining > 0:
        children = []
        try:
            def dir_key(e):
                if sort_by == "modified":
                    try: return e.stat().st_mtime or 0
                    except (PermissionError, OSError): return 0
                return e.name.lower()
            with os.scandir(p) as it:
                dirs = sorted((e for e in it if e.is_dir()), key=dir_key, reverse=(sort_order == "desc"))
            for entry in dirs:
                children.append(_build_tree(Path(entry.path), remaining - 1, slug, root, sort_by, sort_order))
        except PermissionError:
            pass
        node["children"] = children
    return node


_FILTER_MAX_LEN = 200
_VALID_SORT = {"name", "size", "modified", "type"}

files_router = APIRouter()


@files_router.get("/list")
def list_directory(
    path: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    filter: str | None = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
):
    if not path:
        return {"path": "", "entries": [], "total": 0, "page": 1, "page_size": 0}
    abs_path, slug, root = parse_path(path)
    if not abs_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    pattern = None
    if filter:
        if len(filter) > _FILTER_MAX_LEN:
            raise HTTPException(status_code=400, detail=f"Filter pattern too long (max {_FILTER_MAX_LEN} chars)")
        try:
            pattern = re.compile(filter)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as exe:
            try:
                exe.submit(pattern.search, "a" * 100 + "!").result(timeout=1.0)
            except concurrent.futures.TimeoutError:
                raise HTTPException(status_code=400, detail="Filter pattern is too complex")
    if sort_by not in _VALID_SORT:
        sort_by = "name"
    reverse = sort_order == "desc"

    def dir_key(e):
        if sort_by == "modified":
            try: return e.stat().st_mtime or 0
            except (PermissionError, OSError): return 0
        return e.name.lower()

    def file_key(e):
        if sort_by == "name": return e.name.lower()
        try:
            st = e.stat()
        except (PermissionError, OSError):
            return 0 if sort_by in ("size", "modified") else ""
        if sort_by == "size": return st.st_size
        if sort_by == "modified": return st.st_mtime or 0
        if sort_by == "type": return Path(e.path).suffix.lower()
        return e.name.lower()

    try:
        with os.scandir(abs_path) as it:
            raw = [e for e in it if pattern is None or pattern.search(e.name)]
    except PermissionError:
        raw = []

    dirs  = sorted([e for e in raw if     e.is_dir()], key=dir_key,  reverse=reverse)
    files = sorted([e for e in raw if not e.is_dir()], key=file_key, reverse=reverse)
    all_entries = dirs + files
    total = len(all_entries)
    start = (page - 1) * page_size
    page_entries = [_entry_info(Path(e.path), slug, root) for e in all_entries[start: start + page_size]]
    return {"path": build_entry_path(abs_path, slug, root), "entries": page_entries,
            "total": total, "page": page, "page_size": page_size}


@files_router.get("/tree")
def get_tree(path: str = Query(""), depth: int = Query(1),
             sort_by: str = Query("name"), sort_order: str = Query("asc")):
    if not path:
        children = []
        for slug, display_name, abs_path in get_roots():
            node = _build_tree(abs_path, depth - 1, slug, abs_path, sort_by, sort_order)
            node["name"] = display_name
            children.append(node)
        return {"name": "Home", "path": "", "type": "directory",
                "size": None, "modified": None, "is_dir": True, "extension": None,
                "children": children}
    abs_path, slug, root = parse_path(path)
    if not abs_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    return _build_tree(abs_path, depth, slug, root, sort_by, sort_order)


@files_router.get("/download")
def download_file(path: str = Query(...)):
    file_path, _, _ = parse_path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")
    return FileResponse(path=file_path, filename=file_path.name, media_type="application/octet-stream")


# ── Write operations ──────────────────────────────────────────────────────────

def _get_total_size(path: Path) -> int:
    if path.is_symlink(): return 0
    if not path.exists(): return 0
    if path.is_file():
        try: return path.stat().st_size
        except OSError: return 0
    total = 0
    stack = [str(path)]
    while stack:
        try:
            with os.scandir(stack.pop()) as it:
                for entry in it:
                    try:
                        if entry.is_file(): total += entry.stat().st_size
                        elif entry.is_dir(follow_symlinks=False): stack.append(entry.path)
                    except OSError: pass
        except OSError: pass
    return total


_COPY_CHUNK = 4 * 1024 * 1024  # 4 MB


def _copy_file_with_poll(src: Path, dst: Path, cancel: threading.Event | None = None):
    try:
        with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
            while True:
                if cancel is not None and cancel.is_set():
                    return
                chunk = fsrc.read(_COPY_CHUNK)
                if not chunk:
                    break
                fdst.write(chunk)
                yield len(chunk)
        try: shutil.copystat(src, dst)
        except OSError: pass
    except GeneratorExit:
        if cancel is not None:
            cancel.set()
        raise


def _copy_dir_with_poll(src: Path, dst: Path, cancel: threading.Event | None = None):
    dst.mkdir(parents=True, exist_ok=True)
    stack = [(src, dst)]
    while stack:
        if cancel is not None and cancel.is_set():
            return
        cur_src, cur_dst = stack.pop()
        with os.scandir(cur_src) as it:
            for entry in it:
                if cancel is not None and cancel.is_set():
                    return
                dst_item = cur_dst / entry.name
                if entry.is_dir(follow_symlinks=False):
                    dst_item.mkdir(exist_ok=True)
                    stack.append((Path(entry.path), dst_item))
                else:
                    yield from _copy_file_with_poll(Path(entry.path), dst_item, cancel)
    try: shutil.copystat(src, dst)
    except OSError: pass


def _require_write():
    if os.environ.get("FILE_VIEWER_WRITE", "").lower() in ("", "0", "false", "no"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")


def _is_root(path: Path) -> bool:
    return any(path == root for _, _, root in get_roots())


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _sse_response(generator):
    return StreamingResponse(generator, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _coexist_name(dest_dir: Path, name: str) -> str:
    if not (dest_dir / name).exists(): return name
    p = Path(name); stem, suffix = p.stem, p.suffix
    counter = 1
    while True:
        candidate = f"{stem} ({counter}){suffix}"
        if not (dest_dir / candidate).exists(): return candidate
        counter += 1


write_router = APIRouter(dependencies=[Depends(_require_write)])


class MkdirRequest(BaseModel):
    parent: str; name: str

class TouchRequest(BaseModel):
    parent: str; name: str

class RenameRequest(BaseModel):
    path: str; new_name: str

class SaveRequest(BaseModel):
    path: str; content: str

class ConflictEntry(BaseModel):
    name: str; dest_parent: str

class CheckConflictsRequest(BaseModel):
    entries: list[ConflictEntry]

class BatchEntry(BaseModel):
    src: str; dest_parent: str

class BatchPasteRequest(BaseModel):
    entries: list[BatchEntry]; action: str; on_conflict: str

class BatchDeleteRequest(BaseModel):
    paths: list[str]

class BatchSymlinkRequest(BaseModel):
    entries: list[BatchEntry]; on_conflict: str


@write_router.post("/mkdir")
def make_directory(req: MkdirRequest):
    parent = validate_path(req.parent)
    if not parent.is_dir(): raise HTTPException(status_code=400, detail="Parent is not a directory")
    target = parent / req.name
    if target.exists(): raise HTTPException(status_code=409, detail="Already exists")
    try: target.mkdir()
    except PermissionError: raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@write_router.post("/touch")
def touch_file(req: TouchRequest):
    parent = validate_path(req.parent)
    if not parent.is_dir(): raise HTTPException(status_code=400, detail="Parent is not a directory")
    target = parent / req.name
    if target.exists(): raise HTTPException(status_code=409, detail="Already exists")
    try: target.touch()
    except PermissionError: raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@write_router.post("/save")
def save_file(req: SaveRequest):
    file_path = validate_path(req.path)
    if file_path.is_dir(): raise HTTPException(status_code=400, detail="Path is a directory")
    try: file_path.write_text(req.content, encoding="utf-8")
    except PermissionError: raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@write_router.post("/rename")
def rename(req: RenameRequest):
    src = validate_path(req.path)
    if _is_root(src): raise HTTPException(status_code=403, detail="Cannot rename a root directory")
    if not src.exists(): raise HTTPException(status_code=404, detail="Not found")
    dst = src.parent / req.new_name
    if dst.exists(): raise HTTPException(status_code=409, detail="Target name already exists")
    try: src.rename(dst)
    except PermissionError: raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@write_router.post("/check-conflicts")
def check_conflicts(req: CheckConflictsRequest):
    conflicts = []
    for entry in req.entries:
        dest_dir = validate_path(entry.dest_parent)
        if (dest_dir / entry.name).exists():
            conflicts.append({"name": entry.name})
    return {"conflicts": conflicts}


@write_router.post("/paste")
def paste(req: BatchPasteRequest):
    cancel = threading.Event()
    def generate():
        total = len(req.entries)
        entry_srcs  = [validate_path(e.src) for e in req.entries]
        entry_sizes = [_get_total_size(s) for s in entry_srcs]
        bytes_total = sum(entry_sizes)
        bytes_done = 0; last_yield_time = 0.0

        def _prog(done_count, name, **extra):
            return _sse({'type': 'progress', 'done': done_count, 'total': total,
                         'name': name, 'bytes_done': bytes_done, 'bytes_total': bytes_total, **extra})
        def _err(done_count, name, message):
            return _sse({'type': 'error', 'done': done_count, 'total': total,
                         'name': name, 'bytes_done': bytes_done, 'bytes_total': bytes_total, 'message': message})

        try:
            for i, entry in enumerate(req.entries):
                if cancel.is_set():
                    break
                src = entry_srcs[i]; name = src.name
                if _is_root(src):
                    bytes_done += entry_sizes[i]
                    yield _err(i + 1, name, 'Cannot copy/move a root directory')
                    continue
                dest_dir = validate_path(entry.dest_parent)
                dest = dest_dir / name; bytes_before = bytes_done
                try:
                    if dest.exists() or dest.is_symlink():
                        if req.on_conflict == "skip":
                            bytes_done += entry_sizes[i]; yield _prog(i + 1, name, skipped=True); continue
                        elif req.on_conflict == "overwrite":
                            if dest == src:
                                bytes_done += entry_sizes[i]; yield _prog(i + 1, name); continue
                            shutil.rmtree(dest) if (dest.is_dir() and not dest.is_symlink()) else dest.unlink()
                        elif req.on_conflict == "coexist":
                            name = _coexist_name(dest_dir, name); dest = dest_dir / name
                    if req.action == "move":
                        try:
                            src.rename(dest); bytes_done += entry_sizes[i]; yield _prog(i + 1, name); continue
                        except OSError: pass
                    if src.is_symlink():
                        os.symlink(os.readlink(src), dest)
                        bytes_done += entry_sizes[i]
                        if req.action == "move":
                            src.unlink()
                        yield _prog(i + 1, name)
                        continue
                    copy_gen = _copy_dir_with_poll(src, dest, cancel) if src.is_dir() else _copy_file_with_poll(src, dest, cancel)
                    for delta in copy_gen:
                        bytes_done += delta
                        now = time.monotonic()
                        if now - last_yield_time >= 0.2:
                            last_yield_time = now; yield _prog(i, name)
                    if cancel.is_set():
                        try:
                            shutil.rmtree(dest) if dest.is_dir() else dest.unlink()
                        except OSError: pass
                        break
                    if req.action == "move":
                        shutil.rmtree(src) if src.is_dir() else src.unlink()
                    yield _prog(i + 1, name)
                except Exception as e:
                    bytes_done = max(bytes_done, bytes_before + entry_sizes[i])
                    yield _err(i + 1, name, str(e))
            if not cancel.is_set():
                yield _sse({'type': 'done'})
        except GeneratorExit:
            cancel.set()
            raise
    return _sse_response(generate())


@write_router.post("/symlink")
def create_symlinks(req: BatchSymlinkRequest):
    cancel = threading.Event()
    def generate():
        total = len(req.entries)
        try:
            for i, entry in enumerate(req.entries):
                if cancel.is_set():
                    break
                src = validate_path(entry.src); name = src.name
                dest_dir = validate_path(entry.dest_parent); dest = dest_dir / name
                try:
                    if dest.exists() or dest.is_symlink():
                        if req.on_conflict == "skip":
                            yield _sse({'type': 'progress', 'done': i+1, 'total': total, 'name': name, 'skipped': True}); continue
                        elif req.on_conflict == "overwrite":
                            shutil.rmtree(dest) if (dest.is_dir() and not dest.is_symlink()) else dest.unlink()
                        elif req.on_conflict == "coexist":
                            name = _coexist_name(dest_dir, name); dest = dest_dir / name
                    os.symlink(src, dest)
                    yield _sse({'type': 'progress', 'done': i+1, 'total': total, 'name': name})
                except Exception as e:
                    yield _sse({'type': 'error', 'done': i+1, 'total': total, 'name': name, 'message': str(e)})
            if not cancel.is_set():
                yield _sse({'type': 'done'})
        except GeneratorExit:
            cancel.set()
            raise
    return _sse_response(generate())


@write_router.post("/delete")
def delete_entries(req: BatchDeleteRequest):
    cancel = threading.Event()
    def generate():
        total = len(req.paths)
        try:
            for i, path in enumerate(req.paths):
                if cancel.is_set():
                    break
                target = validate_path(path); name = target.name
                if _is_root(target):
                    yield _sse({'type': 'error', 'done': i+1, 'total': total, 'name': name, 'message': 'Cannot delete a root directory'}); continue
                try:
                    if not target.exists() and not target.is_symlink():
                        raise FileNotFoundError(f"{name}: not found")
                    shutil.rmtree(target) if (target.is_dir() and not target.is_symlink()) else target.unlink()
                    yield _sse({'type': 'progress', 'done': i+1, 'total': total, 'name': name})
                except Exception as e:
                    yield _sse({'type': 'error', 'done': i+1, 'total': total, 'name': name, 'message': str(e)})
            if not cancel.is_set():
                yield _sse({'type': 'done'})
        except GeneratorExit:
            cancel.set()
            raise
    return _sse_response(generate())


@write_router.get("/upload-status")
def upload_status(parent: str = Query(...), filename: str = Query(...)):
    dest_dir = validate_path(parent); safe_name = Path(filename).name
    part_path = dest_dir / (safe_name + '.fvpart')
    return {'offset': part_path.stat().st_size if part_path.exists() else 0}


@write_router.post("/upload-stream")
async def upload_stream(
    request: Request,
    parent: str = Query(...), filename: str = Query(...),
    offset: int = Query(0), total: int = Query(...),
    on_conflict: str = Query(default='overwrite'),
):
    dest_dir = validate_path(parent)
    if not dest_dir.is_dir(): raise HTTPException(status_code=400, detail="Destination is not a directory")
    safe_name = Path(filename).name
    if not safe_name: raise HTTPException(status_code=400, detail="Invalid filename")
    part_path = dest_dir / (safe_name + '.fvpart'); dest_path = dest_dir / safe_name
    current = part_path.stat().st_size if part_path.exists() else 0
    if offset > 0 and offset != current:
        raise HTTPException(status_code=409, detail=f"Offset mismatch: expected {current}, got {offset}")
    try:
        mode = 'ab' if offset > 0 else 'wb'
        with open(part_path, mode) as out:
            async for chunk in request.stream():
                out.write(chunk)
    except Exception:
        return {'ok': True, 'done': False, 'offset': part_path.stat().st_size if part_path.exists() else 0}
    received = part_path.stat().st_size if part_path.exists() else 0
    if received < total:
        return {'ok': True, 'done': False, 'offset': received}
    if dest_path.exists():
        if on_conflict == 'skip':
            part_path.unlink(missing_ok=True); return {'ok': True, 'done': True, 'saved': None}
        elif on_conflict == 'coexist':
            dest_path = dest_dir / _coexist_name(dest_dir, safe_name)
        elif on_conflict == 'overwrite':
            try: dest_path.unlink()
            except OSError: pass
    part_path.rename(dest_path)
    return {'ok': True, 'done': True, 'saved': dest_path.name}


# ── fs services ───────────────────────────────────────────────────────────────

def _fs_read(path_str: str) -> bytes:
    p = validate_path(path_str)
    return p.read_bytes()


def _fs_write(path_str: str, data: bytes) -> None:
    p = validate_path(path_str)
    p.write_bytes(data)


def _fs_resolve(path_str: str) -> Path:
    return validate_path(path_str)


async def setup(ctx):
    ft_registry = ctx.services.get("file-type.registry")
    ft_registry.register("image",   list(IMAGE_EXTENSIONS),   PLUGIN_ID)
    ft_registry.register("parquet", list(PARQUET_EXTENSIONS), PLUGIN_ID)
    ft_registry.register("csv",     list(CSV_EXTENSIONS),     PLUGIN_ID)
    ft_registry.register("json",    list(JSON_EXTENSIONS),    PLUGIN_ID)
    ft_registry.register("jsonl",   list(JSONL_EXTENSIONS),   PLUGIN_ID)
    ft_registry.register("text",    list(TEXT_EXTENSIONS),    PLUGIN_ID)
    ft_registry.register("video",   list(VIDEO_MIME_TYPES),   PLUGIN_ID)
    ft_registry.register("audio",   list(AUDIO_MIME_TYPES),   PLUGIN_ID)
    ft_registry.register("archive", list(ARCHIVE_EXTENSIONS), PLUGIN_ID)

    ctx.services.register("fs.read",    _fs_read,    PLUGIN_ID)
    ctx.services.register("fs.write",   _fs_write,   PLUGIN_ID)
    ctx.services.register("fs.resolve", _fs_resolve, PLUGIN_ID)

    ctx.app.include_router(files_router, prefix="/api/files", tags=["files"])
    ctx.app.include_router(write_router, prefix="/api/write", tags=["write"])


async def teardown(ctx):
    ctx.services.unregister("fs.read",    PLUGIN_ID)
    ctx.services.unregister("fs.write",   PLUGIN_ID)
    ctx.services.unregister("fs.resolve", PLUGIN_ID)
    ft_registry = ctx.services.get("file-type.registry")
    ft_registry.unregister_plugin(PLUGIN_ID)
