import os
import shutil
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from fileviewer.config import validate_path

router = APIRouter()


def require_write():
    if not os.environ.get("FILE_VIEWER_WRITE"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")


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
    new_dir.mkdir()
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
    new_file.touch()
    return {"ok": True}


@router.post("/save")
def save_file(req: SaveRequest):
    require_write()
    file_path = validate_path(req.path)
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")
    file_path.write_text(req.content, encoding="utf-8")
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
    src.rename(dst)
    return {"ok": True}


@router.delete("/delete")
def delete(path: str = Query(...)):
    require_write()
    target = validate_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
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
