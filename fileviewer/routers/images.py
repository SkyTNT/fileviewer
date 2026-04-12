import io
from functools import lru_cache
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, FileResponse
from PIL import Image

from fileviewer.config import validate_path, get_roots, IMAGE_EXTENSIONS

router = APIRouter()

_HEADERS = {"User-Agent": "Mozilla/5.0"}


# ── Local image helpers ───────────────────────────────────────────────────────

@lru_cache(maxsize=512)
def _generate_thumbnail(path: str, size: int, mtime: float) -> bytes:
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
    async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True) as client:
        resp = await client.get(url, timeout=10)
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return resp.content, ct


def _make_thumbnail(data: bytes, size: int) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/thumbnail")
async def get_thumbnail(path: str = Query(...), size: int = Query(300)):
    if path.startswith(("http://", "https://")):
        try:
            data, _ = await _fetch_url(path)
            return Response(content=_make_thumbnail(data, size), media_type="image/jpeg")
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
