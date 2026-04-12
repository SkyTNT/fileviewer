import io
from functools import lru_cache
from pathlib import Path

from async_lru import alru_cache

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, FileResponse
from PIL import Image

from fileviewer.config import validate_path, get_roots, IMAGE_EXTENSIONS, IMAGE_MIME_TYPES
from fileviewer.http_client import client as _client

router = APIRouter()


# ── Local image helpers ───────────────────────────────────────────────────────

@lru_cache(maxsize=512)
def _generate_thumbnail(path: str, size: int, mtime: float) -> bytes:
    with Image.open(path) as img:
        return _pil_to_jpeg(img, size)


def _resolve_abs_path(path: str) -> Path | None:
    """Accept root-relative OR absolute path (must be under a root)."""
    try:
        p = validate_path(path)
        if p.is_file():
            return p
    except Exception:
        pass
    try:
        p = Path(path)
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            for _, _, root in get_roots():
                try:
                    p.relative_to(root)
                    return p
                except ValueError:
                    continue
    except Exception:
        pass
    return None


# ── URL helpers ───────────────────────────────────────────────────────────────

async def _fetch_url(url: str) -> tuple[bytes, str]:
    resp = await _client.get(url)
    resp.raise_for_status()
    ct = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    return resp.content, ct


def _pil_to_jpeg(img: Image.Image, size: int) -> bytes:
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


@alru_cache(maxsize=256)
async def _url_thumbnail(url: str, size: int) -> bytes:
    resp = await _client.get(url)
    resp.raise_for_status()
    with Image.open(io.BytesIO(resp.content)) as img:
        return _pil_to_jpeg(img, size)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/thumbnail")
async def get_thumbnail(path: str = Query(...), size: int = Query(300)):
    if path.startswith(("http://", "https://")):
        try:
            return Response(content=await _url_thumbnail(path, size), media_type="image/jpeg")
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    file_path = _resolve_abs_path(path)
    if file_path is None:
        file_path = validate_path(path)  # let validate_path raise its own 404/403

    if file_path.suffix.lower() == ".svg":
        return FileResponse(str(file_path), media_type="image/svg+xml")

    try:
        mtime = file_path.stat().st_mtime
        data = _generate_thumbnail(str(file_path), size, mtime)
        return Response(content=data, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/full")
async def get_full_image(path: str = Query(...)):
    if path.startswith(("http://", "https://")):
        try:
            data, ct = await _fetch_url(path)
            return Response(content=data, media_type=ct)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    file_path = _resolve_abs_path(path)
    if file_path is None:
        file_path = validate_path(path)

    mt = IMAGE_MIME_TYPES.get(file_path.suffix.lower(), "application/octet-stream")
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
