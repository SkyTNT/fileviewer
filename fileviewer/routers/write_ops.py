import os
import json
import shutil
import threading
import time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fileviewer.config import validate_path, get_roots

def _get_total_size(path: Path) -> int:
    """Return total byte size of a file or directory tree.
    Uses os.scandir so DirEntry caches is_file/stat — avoids redundant syscalls."""
    if not path.exists():
        return 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    stack = [str(path)]
    while stack:
        try:
            with os.scandir(stack.pop()) as it:
                for entry in it:
                    try:
                        if entry.is_file():
                            total += entry.stat().st_size
                        elif entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                    except OSError:
                        pass
        except OSError:
            pass
    return total


def _copy_file_with_poll(src: Path, dst: Path):
    """Run shutil.copy2 in a thread; yield delta bytes every ~100 ms by polling dst size."""
    err = [None]
    done = [False]

    def _worker():
        try:
            shutil.copy2(src, dst)
        except Exception as e:
            err[0] = e
        finally:
            done[0] = True

    worker = threading.Thread(target=_worker, daemon=True)
    worker.start()

    last_size = 0
    while not done[0]:
        worker.join(timeout=0.1)
        try:
            current = dst.stat().st_size
        except OSError:
            current = last_size
        if current > last_size:
            yield current - last_size
            last_size = current

    if err[0]:
        raise err[0]

    # Capture any bytes not yet reported (e.g. if thread finished between last poll and loop exit)
    try:
        final = dst.stat().st_size
    except OSError:
        final = last_size
    if final > last_size:
        yield final - last_size


def _copy_dir_with_poll(src: Path, dst: Path):
    """Recursively copy a directory tree file-by-file with progress polling; yield delta bytes.
    Uses os.scandir so DirEntry caches is_file/is_dir — avoids redundant syscalls."""
    dst.mkdir(parents=True, exist_ok=True)
    stack = [(src, dst)]
    while stack:
        cur_src, cur_dst = stack.pop()
        with os.scandir(cur_src) as it:
            for entry in it:
                dst_item = cur_dst / entry.name
                if entry.is_dir(follow_symlinks=False):
                    dst_item.mkdir(exist_ok=True)
                    stack.append((Path(entry.path), dst_item))
                else:
                    yield from _copy_file_with_poll(Path(entry.path), dst_item)
    try:
        shutil.copystat(src, dst)
    except OSError:
        pass


def require_write():
    if os.environ.get("FILE_VIEWER_WRITE", "").lower() in ("", "0", "false", "no"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")


router = APIRouter(dependencies=[Depends(require_write)])


def _is_root(path: Path) -> bool:
    """Return True if path is exactly one of the configured root directories."""
    return any(path == root for _, _, root in get_roots())


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _sse_response(generator):
    return StreamingResponse(generator, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _create_path_item(parent_str: str, name: str, factory):
    parent = validate_path(parent_str)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")
    target = parent / name
    if target.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    try:
        factory(target)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


def _coexist_name(dest_dir: Path, name: str) -> str:
    """Return a non-conflicting name by appending (1), (2), … before the extension."""
    if not (dest_dir / name).exists():
        return name
    p = Path(name)
    stem, suffix = p.stem, p.suffix
    counter = 1
    while True:
        candidate = f"{stem} ({counter}){suffix}"
        if not (dest_dir / candidate).exists():
            return candidate
        counter += 1


class MkdirRequest(BaseModel):
    parent: str
    name: str


class TouchRequest(BaseModel):
    parent: str
    name: str


class RenameRequest(BaseModel):
    path: str
    new_name: str


class SaveRequest(BaseModel):
    path: str
    content: str


@router.post("/mkdir")
def make_directory(req: MkdirRequest):
    return _create_path_item(req.parent, req.name, lambda p: p.mkdir())


@router.post("/touch")
def touch_file(req: TouchRequest):
    return _create_path_item(req.parent, req.name, lambda p: p.touch())


@router.post("/save")
def save_file(req: SaveRequest):

    file_path = validate_path(req.path)
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")
    try:
        file_path.write_text(req.content, encoding="utf-8")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.post("/rename")
def rename(req: RenameRequest):

    src = validate_path(req.path)
    if _is_root(src):
        raise HTTPException(status_code=403, detail="Cannot rename a root directory")
    if not src.exists():
        raise HTTPException(status_code=404, detail="Not found")
    dst = src.parent / req.new_name
    if dst.exists():
        raise HTTPException(status_code=409, detail="Target name already exists")
    try:
        src.rename(dst)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}




class ConflictEntry(BaseModel):
    name: str
    dest_parent: str


class CheckConflictsRequest(BaseModel):
    entries: list[ConflictEntry]


class BatchEntry(BaseModel):
    src: str
    dest_parent: str


class BatchPasteRequest(BaseModel):
    entries: list[BatchEntry]
    action: str           # 'copy' | 'move'
    on_conflict: str      # 'overwrite' | 'skip' | 'coexist'


class BatchDeleteRequest(BaseModel):
    paths: list[str]


@router.post("/check-conflicts")
def check_conflicts(req: CheckConflictsRequest):
    conflicts = []
    for entry in req.entries:
        dest_dir = validate_path(entry.dest_parent)
        if (dest_dir / entry.name).exists():
            conflicts.append({"name": entry.name})
    return {"conflicts": conflicts}


@router.post("/paste")
def paste(req: BatchPasteRequest):

    def generate():
        total = len(req.entries)

        # Pre-scan total bytes for all entries
        entry_srcs   = [validate_path(e.src) for e in req.entries]
        entry_sizes  = [_get_total_size(s) for s in entry_srcs]
        bytes_total  = sum(entry_sizes)

        bytes_done      = 0
        last_yield_time = 0.0

        def _progress_sse(done_count, name, **extra):
            return _sse({'type': 'progress', 'done': done_count, 'total': total,
                         'name': name, 'bytes_done': bytes_done, 'bytes_total': bytes_total, **extra})

        def _error_sse(done_count, name, message):
            return _sse({'type': 'error', 'done': done_count, 'total': total,
                         'name': name, 'bytes_done': bytes_done, 'bytes_total': bytes_total,
                         'message': message})

        for i, entry in enumerate(req.entries):
            src  = entry_srcs[i]
            name = src.name

            if _is_root(src):
                bytes_done += entry_sizes[i]
                yield _error_sse(i + 1, name, 'Cannot copy/move a root directory')
                continue

            dest_dir    = validate_path(entry.dest_parent)
            dest        = dest_dir / name
            bytes_before = bytes_done

            try:
                if dest.exists():
                    if req.on_conflict == "skip":
                        bytes_done += entry_sizes[i]
                        yield _progress_sse(i + 1, name, skipped=True)
                        continue
                    elif req.on_conflict == "overwrite":
                        if dest == src:
                            bytes_done += entry_sizes[i]
                            yield _progress_sse(i + 1, name)
                            continue
                        shutil.rmtree(dest) if dest.is_dir() else dest.unlink()
                    elif req.on_conflict == "coexist":
                        name = _coexist_name(dest_dir, name)
                        dest = dest_dir / name

                if req.action == "move":
                    try:
                        src.rename(dest)
                        # Same-filesystem rename is instant — count full size at once
                        bytes_done += entry_sizes[i]
                        yield _progress_sse(i + 1, name)
                        continue
                    except OSError:
                        pass  # Cross-device: fall through to copy + delete

                # Copy (or cross-device move): stream with progress
                gen = _copy_dir_with_poll(src, dest) if src.is_dir() else _copy_file_with_poll(src, dest)
                for delta in gen:
                    bytes_done += delta
                    now = time.monotonic()
                    if now - last_yield_time >= 0.2:   # at most 5 SSE events / second
                        last_yield_time = now
                        yield _progress_sse(i, name)

                if req.action == "move":
                    shutil.rmtree(src) if src.is_dir() else src.unlink()

                yield _progress_sse(i + 1, name)

            except Exception as e:
                bytes_done = max(bytes_done, bytes_before + entry_sizes[i])
                yield _error_sse(i + 1, name, str(e))

        yield _sse({'type': 'done'})

    return _sse_response(generate())


@router.post("/delete")
def delete_entries(req: BatchDeleteRequest):

    def generate():
        total = len(req.paths)
        for i, path in enumerate(req.paths):
            target = validate_path(path)
            name = target.name
            if _is_root(target):
                yield _sse({'type': 'error', 'done': i + 1, 'total': total, 'name': name, 'message': 'Cannot delete a root directory'})
                continue
            try:
                if not target.exists():
                    raise FileNotFoundError(f"{name}: not found")
                shutil.rmtree(target) if target.is_dir() else target.unlink()
                yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': name})
            except Exception as e:
                yield _sse({'type': 'error', 'done': i + 1, 'total': total, 'name': name, 'message': str(e)})

        yield _sse({'type': 'done'})

    return _sse_response(generate())


@router.post("/upload")
async def upload(
    parent: str = Form(...),
    files: list[UploadFile] = File(...),
    on_conflict: str = Form(default='overwrite'),
):
    dir_path = validate_path(parent)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    saved = []
    for f in files:
        filename = Path(f.filename).name  # strip any directory components
        if not filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        dest = dir_path / filename
        if dest.exists():
            if on_conflict == 'skip':
                continue
            elif on_conflict == 'coexist':
                dest = dir_path / _coexist_name(dir_path, filename)
            # 'overwrite' falls through
        content = await f.read()
        dest.write_bytes(content)
        saved.append(dest.name)
    return {"ok": True, "saved": saved}
