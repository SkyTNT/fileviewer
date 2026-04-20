from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from config import validate_path

PLUGIN_ID = "text"
router = APIRouter()


@router.get("/content")
def get_text_content(path: str = Query(...), max_bytes: int = Query(5 * 1024 * 1024)):
    file_path = validate_path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with file_path.open("rb") as f:
            sample = f.read(8192)
        if b"\x00" in sample:
            raise HTTPException(status_code=415, detail="Binary file cannot be displayed as text")
        raw = file_path.read_bytes()
        truncated = len(raw) > max_bytes
        text = raw[:max_bytes].decode("utf-8", errors="replace")
        return {"content": text, "truncated": truncated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveRequest(BaseModel):
    path: str
    content: str


@router.post("/save")
def save_file(req: SaveRequest):
    import os
    if os.environ.get("FILE_VIEWER_WRITE", "").lower() in ("", "0", "false", "no"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")
    file_path = validate_path(req.path)
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")
    try:
        file_path.write_text(req.content, encoding="utf-8")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


async def setup(ctx):
    ctx.app.include_router(router, prefix="/api/text", tags=["text"])


async def teardown(ctx):
    pass
