from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from fileviewer.config import validate_path, VIDEO_MIME_TYPES, AUDIO_MIME_TYPES

router = APIRouter()


@router.get("/stream")
def get_media_stream(path: str = Query(...)):
    """Stream a video or audio file with range-request support for seeking."""
    file_path = validate_path(path)
    suffix = file_path.suffix.lower()
    mt = VIDEO_MIME_TYPES.get(suffix) or AUDIO_MIME_TYPES.get(suffix, 'application/octet-stream')
    return FileResponse(str(file_path), media_type=mt)
