import os
import json
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fileviewer.config import validate_path, get_roots

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




class BatchEntry(BaseModel):
    src: str
    dest_parent: str


class CheckConflictsRequest(BaseModel):
    entries: list[BatchEntry]
    action: str  # 'copy' | 'move'


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
        src = validate_path(entry.src)
        if _is_root(src):
            raise HTTPException(status_code=403, detail=f"Cannot copy/move root directory '{src.name}'")
        dest_dir = validate_path(entry.dest_parent)
        if (dest_dir / src.name).exists():
            conflicts.append({"src": entry.src, "name": src.name})
    return {"conflicts": conflicts}


@router.post("/paste")
def paste(req: BatchPasteRequest):

    def generate():
        total = len(req.entries)
        for i, entry in enumerate(req.entries):
            src = validate_path(entry.src)
            name = src.name
            if _is_root(src):
                yield _sse({'type': 'error', 'done': i + 1, 'total': total, 'name': name, 'message': 'Cannot copy/move a root directory'})
                continue
            dest_dir = validate_path(entry.dest_parent)
            dest = dest_dir / name
            try:
                if dest.exists():
                    if req.on_conflict == "skip":
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': name, 'skipped': True})
                        continue
                    elif req.on_conflict == "overwrite":
                        shutil.rmtree(dest) if dest.is_dir() else dest.unlink()
                    elif req.on_conflict == "coexist":
                        name = _coexist_name(dest_dir, name)
                        dest = dest_dir / name

                if req.action == "copy":
                    shutil.copytree(src, dest) if src.is_dir() else shutil.copy2(src, dest)
                else:
                    shutil.move(str(src), str(dest))

                yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': name})
            except Exception as e:
                yield _sse({'type': 'error', 'done': i + 1, 'total': total, 'name': name, 'message': str(e)})

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
):

    dir_path = validate_path(parent)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    saved = []
    for f in files:
        dest = dir_path / f.filename
        content = await f.read()
        dest.write_bytes(content)
        saved.append(f.filename)
    return {"ok": True, "saved": saved}
