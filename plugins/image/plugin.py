import asyncio
import io
from functools import lru_cache
from pathlib import Path

from async_lru import alru_cache
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, FileResponse
from PIL import Image

from config import validate_path, validate_abs_path

PLUGIN_ID = "image"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}
IMAGE_MIME_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml", ".tiff": "image/tiff", ".tif": "image/tiff",
}

_http_client = None
router = APIRouter()


@lru_cache(maxsize=512)
def _generate_thumbnail(path: str, size: int, mtime: float) -> bytes:
    with Image.open(path) as img:
        return _pil_to_jpeg(img, size)


def _resolve_local_path(path: str) -> Path | None:
    try:
        p = validate_path(path)
        if p.is_file():
            return p
    except Exception:
        pass
    p = Path(path)
    if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
        return validate_abs_path(str(p))
    return None


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


@alru_cache(maxsize=32)
async def _fetch_url(url: str) -> tuple[bytes, str]:
    resp = await _http_client.get(url)
    resp.raise_for_status()
    ct = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    if not ct.startswith("image/"):
        raise ValueError(f"URL did not return an image (content-type: {ct!r})")
    return resp.content, ct


@alru_cache(maxsize=128)
async def _url_thumbnail(url: str, size: int) -> bytes:
    data, _ = await _fetch_url(url)
    return await asyncio.to_thread(_pil_to_jpeg_from_bytes, data, size)


def _pil_to_jpeg_from_bytes(data: bytes, size: int) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        return _pil_to_jpeg(img, size)


@router.get("/thumbnail")
async def get_thumbnail(request: Request, path: str = Query(...), size: int = Query(300)):
    if path.startswith(("http://", "https://")):
        try:
            return Response(content=await _url_thumbnail(path, size), media_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=31536000, immutable"})
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to fetch remote image")
    file_path = _resolve_local_path(path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file_path.suffix.lower() == ".svg":
        return FileResponse(str(file_path), media_type="image/svg+xml",
                            headers={"Cache-Control": "no-cache"})
    try:
        mtime = file_path.stat().st_mtime
        etag = f'"{mtime}"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        data = await asyncio.to_thread(_generate_thumbnail, str(file_path), size, mtime)
        return Response(content=data, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache", "ETag": etag})
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail")


@router.get("/full")
async def get_full_image(path: str = Query(...)):
    if path.startswith(("http://", "https://")):
        try:
            data, ct = await _fetch_url(path)
            return Response(content=data, media_type=ct,
                            headers={"Cache-Control": "public, max-age=31536000, immutable"})
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to fetch remote image")
    file_path = _resolve_local_path(path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    mt = IMAGE_MIME_TYPES.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(str(file_path), media_type=mt, headers={"Cache-Control": "no-cache"})


@router.post("/save")
async def save_image(request: Request, path: str = Query(...)):
    from config import require_write
    require_write()
    file_path = _resolve_local_path(path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid image data")
    file_path.write_bytes(data)
    _generate_thumbnail.cache_clear()
    return {"ok": True}


@router.post("/save-as")
async def save_image_as(request: Request, parent: str = Query(...), filename: str = Query(...)):
    from config import require_write, parse_path, build_entry_path
    require_write()
    abs_dir, slug, root = parse_path(parent)
    if not abs_dir.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")
    safe_name = Path(filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest = abs_dir / safe_name
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid image data")
    dest.write_bytes(data)
    return {"ok": True, "path": build_entry_path(dest, slug, root)}


async def setup(ctx):
    global _http_client
    import httpx
    _http_client = httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=10.0,
        limits=httpx.Limits(max_connections=100),
    )
    ctx.app.include_router(router, prefix="/api/images", tags=["images"])


async def teardown(ctx):
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None
