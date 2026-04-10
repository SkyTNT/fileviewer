from fastapi import APIRouter, Query, HTTPException
from fileviewer.config import validate_path

router = APIRouter()


@router.get("/content")
def read_text(path: str = Query(...), max_bytes: int = Query(5 * 1024 * 1024)):
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


