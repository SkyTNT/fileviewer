from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from fileviewer.config import validate_path

VIDEO_TYPES = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/x-m4v',
    '.ts': 'video/mp2t',
}
AUDIO_TYPES = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma',
}

router = APIRouter()


@router.get("/stream")
def stream_media(path: str = Query(...)):
    """Stream a video or audio file with range-request support for seeking."""
    file_path = validate_path(path)
    suffix = file_path.suffix.lower()
    mt = VIDEO_TYPES.get(suffix) or AUDIO_TYPES.get(suffix, 'application/octet-stream')
    return FileResponse(str(file_path), media_type=mt)
