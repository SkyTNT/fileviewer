import io
from functools import lru_cache
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, FileResponse
from PIL import Image
from fileviewer.config import validate_path

router = APIRouter()


@lru_cache(maxsize=512)
def _generate_thumbnail(path: str, size: int, mtime: float) -> bytes:
    from pathlib import Path
    file_path = Path(path)
    with Image.open(file_path) as img:
        img.thumbnail((size, size), Image.LANCZOS)
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            src = img.convert("RGBA") if img.mode == "P" else img
            bg.paste(src, mask=src.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()


@router.get("/thumbnail")
def get_thumbnail(path: str = Query(...), size: int = Query(300)):
    file_path = validate_path(path)

    if file_path.suffix.lower() == ".svg":
        return FileResponse(str(file_path), media_type="image/svg+xml")

    try:
        mtime = file_path.stat().st_mtime
        data = _generate_thumbnail(str(file_path), size, mtime)
        return Response(content=data, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/full")
def get_full_image(path: str = Query(...)):
    file_path = validate_path(path)
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif",  ".webp": "image/webp", ".bmp": "image/bmp",
        ".svg": "image/svg+xml", ".tiff": "image/tiff", ".tif": "image/tiff",
    }
    mt = media_types.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(str(file_path), media_type=mt)


@router.get("/dimensions")
def get_dimensions(path: str = Query(...)):
    file_path = validate_path(path)
    if file_path.suffix.lower() == ".svg":
        return {"width": None, "height": None}
    try:
        with Image.open(file_path) as img:
            return {"width": img.width, "height": img.height}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
