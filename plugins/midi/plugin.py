import base64
import os
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from config import validate_path, require_write

PLUGIN_ID = "midi"
router = APIRouter()
MIDI_EXTENSIONS = {".mid", ".midi"}

_PLUGIN_DIR = Path(__file__).parent
_DEFAULT_SF = _PLUGIN_DIR / "soundfonts" / "GeneralUserGS.sf3"


@router.get("/raw")
def get_midi_raw(path: str = Query(...)):
    file_path = validate_path(path)
    if file_path.suffix.lower() not in MIDI_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not a MIDI file")
    from urllib.parse import quote
    encoded = quote(file_path.name, safe='')
    return FileResponse(str(file_path), media_type="audio/midi",
                        headers={
                            "Content-Disposition": f"inline; filename*=UTF-8''{encoded}",
                            "Cache-Control": "no-cache",
                        })


@router.get("/soundfont/default")
def get_default_soundfont():
    if not _DEFAULT_SF.exists():
        raise HTTPException(status_code=404, detail="Default SoundFont not found")
    return FileResponse(str(_DEFAULT_SF), media_type="application/octet-stream",
                        headers={"Content-Disposition": f'inline; filename="{_DEFAULT_SF.name}"'})




class SaveMidiRequest(BaseModel):
    path: str
    data: str  # base64-encoded MIDI bytes


@router.post("/save")
def save_midi(req: SaveMidiRequest):
    require_write()
    file_path = validate_path(req.path)
    if file_path.suffix.lower() not in MIDI_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not a MIDI file")
    try:
        raw = base64.b64decode(req.data)
        file_path.write_bytes(raw)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"ok": True}


async def setup(ctx):
    ft_registry = ctx.services.get("file-type.registry")
    ft_registry.register("midi", list(MIDI_EXTENSIONS), PLUGIN_ID)
    ctx.app.include_router(router, prefix="/api/midi", tags=["midi"])


async def teardown(ctx):
    ctx.services.get("file-type.registry").unregister_plugin(PLUGIN_ID)
