import os
import shutil
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from fileviewer.config import validate_path

router = APIRouter()


def require_write():
    if not os.environ.get("FILE_VIEWER_WRITE"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")


def _unique_copy_name(dest_dir: Path, name: str) -> str:
    """Return a name that doesn't conflict in dest_dir, appending _copy suffix."""
    if not (dest_dir / name).exists():
        return name
    p = Path(name)
    stem = p.stem
    suffix = p.suffix
    candidate = f"{stem}_copy{suffix}"
    counter = 2
    while (dest_dir / candidate).exists():
        candidate = f"{stem}_copy_{counter}{suffix}"
        counter += 1
    return candidate


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
    require_write()
    parent = validate_path(req.parent)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")
    new_dir = parent / req.name
    if new_dir.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    try:
        new_dir.mkdir()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.post("/touch")
def touch_file(req: TouchRequest):
    require_write()
    parent = validate_path(req.parent)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")
    new_file = parent / req.name
    if new_file.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    try:
        new_file.touch()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.post("/save")
def save_file(req: SaveRequest):
    require_write()
    file_path = validate_path(req.path)
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")
    try:
        file_path.write_text(req.content, encoding="utf-8")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.post("/rename")
def rename(req: RenameRequest):
    require_write()
    src = validate_path(req.path)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Not found")
    dst = src.parent / req.new_name
    if dst.exists():
        raise HTTPException(status_code=409, detail="Target name already exists")
    try:
        src.rename(dst)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.delete("/delete")
def delete(path: str = Query(...)):
    require_write()
    target = validate_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


class CopyRequest(BaseModel):
    src: str
    dest_parent: str


class MoveRequest(BaseModel):
    src: str
    dest_parent: str


@router.post("/copy")
def copy_entry(req: CopyRequest):
    require_write()
    src = validate_path(req.src)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    dest_dir = validate_path(req.dest_parent)
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")
    dest_name = _unique_copy_name(dest_dir, src.name)
    dest = dest_dir / dest_name
    try:
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True, "name": dest_name}


@router.post("/move")
def move_entry(req: MoveRequest):
    require_write()
    src = validate_path(req.src)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    dest_dir = validate_path(req.dest_parent)
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")
    dest = dest_dir / src.name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists in the destination")
    try:
        shutil.move(str(src), str(dest))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


@router.post("/upload")
async def upload(
    parent: str = Form(...),
    files: list[UploadFile] = File(...),
):
    require_write()
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
