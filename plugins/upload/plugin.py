import os
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException, Request
from config import validate_path

PLUGIN_ID = "upload"
router = APIRouter()


def _require_write():
    if os.environ.get("FILE_VIEWER_WRITE", "").lower() in ("", "0", "false", "no"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")


def _coexist_name(dest_dir: Path, name: str) -> str:
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


@router.get("/status")
def upload_status(parent: str = Query(...), filename: str = Query(...)):
    _require_write()
    dest_dir = validate_path(parent)
    safe_name = Path(filename).name
    part_path = dest_dir / (safe_name + '.fvpart')
    return {'offset': part_path.stat().st_size if part_path.exists() else 0}


@router.post("/stream")
async def upload_stream(
    request: Request,
    parent: str = Query(...),
    filename: str = Query(...),
    offset: int = Query(0),
    total: int = Query(...),
    on_conflict: str = Query(default='overwrite'),
):
    _require_write()
    dest_dir = validate_path(parent)
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")
    safe_name = Path(filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    part_path = dest_dir / (safe_name + '.fvpart')
    dest_path = dest_dir / safe_name
    current = part_path.stat().st_size if part_path.exists() else 0
    if offset > 0 and offset != current:
        raise HTTPException(status_code=409, detail=f"Offset mismatch: expected {current}, got {offset}")
    try:
        mode = 'ab' if offset > 0 else 'wb'
        with open(part_path, mode) as out:
            async for chunk in request.stream():
                out.write(chunk)
    except Exception:
        return {'ok': True, 'done': False, 'offset': part_path.stat().st_size if part_path.exists() else 0}
    received = part_path.stat().st_size if part_path.exists() else 0
    if received < total:
        return {'ok': True, 'done': False, 'offset': received}
    if dest_path.exists():
        if on_conflict == 'skip':
            part_path.unlink(missing_ok=True)
            return {'ok': True, 'done': True, 'saved': None}
        elif on_conflict == 'coexist':
            dest_path = dest_dir / _coexist_name(dest_dir, safe_name)
        elif on_conflict == 'overwrite':
            try:
                dest_path.unlink()
            except OSError:
                pass
    part_path.rename(dest_path)
    return {'ok': True, 'done': True, 'saved': dest_path.name}


async def setup(ctx):
    ctx.app.include_router(router, prefix="/api/upload", tags=["upload"])


async def teardown(ctx):
    pass
