import asyncio
import io
import re
import subprocess
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from PIL import Image

from config import validate_path

PLUGIN_ID = "media"
router = APIRouter()

VIDEO_MIME_TYPES = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.m4v': 'video/x-m4v',
    '.ts': 'video/mp2t',
}
AUDIO_MIME_TYPES = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma',
}


@router.get("/stream")
def get_media_stream(path: str = Query(...)):
    file_path = validate_path(path)
    suffix = file_path.suffix.lower()
    mt = VIDEO_MIME_TYPES.get(suffix) or AUDIO_MIME_TYPES.get(suffix, 'application/octet-stream')
    return FileResponse(str(file_path), media_type=mt)


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


def _extract_cover_data(audio) -> "bytes | None":
    tags = getattr(audio, 'tags', None)
    if tags is not None:
        for key in list(tags.keys()):
            if key.startswith('APIC'):
                return tags[key].data
        if 'covr' in tags:
            covers = tags['covr']
            if covers:
                return bytes(covers[0])
    if hasattr(audio, 'pictures') and audio.pictures:
        return audio.pictures[0].data
    if tags is not None and 'metadata_block_picture' in tags:
        import base64
        from mutagen.flac import Picture
        raw = base64.b64decode(tags['metadata_block_picture'][0])
        return Picture(raw).data
    return None


def _video_thumbnail_sync(path: str, size: int) -> "bytes | None":
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', path, '-vframes', '1', '-f', 'mjpeg', 'pipe:1', '-loglevel', 'quiet'],
            capture_output=True, timeout=15,
        )
        if not result.stdout:
            return None
        with Image.open(io.BytesIO(result.stdout)) as img:
            return _pil_to_jpeg(img, size)
    except Exception:
        return None


def _audio_cover_sync(path: str, size: int) -> "bytes | None":
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(path)
        if audio is None:
            return None
        cover_data = _extract_cover_data(audio)
        if not cover_data:
            return None
        with Image.open(io.BytesIO(cover_data)) as img:
            return _pil_to_jpeg(img, size)
    except Exception:
        return None


@lru_cache(maxsize=256)
def _generate_media_thumbnail(path: str, suffix: str, size: int, mtime: float) -> "bytes | None":
    if suffix in VIDEO_MIME_TYPES:
        return _video_thumbnail_sync(path, size)
    return _audio_cover_sync(path, size)


BITMAP_SUB_CODECS = {'dvd_subtitle', 'hdmv_pgs_subtitle', 'dvbsub', 'xsub', 'dvb_teletext'}


@lru_cache(maxsize=256)
def _video_info_sync(path: str, mtime: float) -> dict:
    try:
        import json as _json
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_streams', '-show_format', path],
            capture_output=True, timeout=10,
        )
        data = _json.loads(result.stdout)
        info = {}
        sub_streams = []
        for stream in data.get('streams', []):
            ctype = stream.get('codec_type')
            if ctype == 'video' and 'img_w' not in info:
                if stream.get('width'):
                    info['img_w'] = stream['width']
                if stream.get('height'):
                    info['img_h'] = stream['height']
                if stream.get('duration'):
                    info['duration'] = float(stream['duration'])
            elif ctype == 'subtitle':
                codec = stream.get('codec_name', '')
                if codec in BITMAP_SUB_CODECS:
                    continue
                tags = stream.get('tags', {})
                lang  = tags.get('language') or tags.get('lang') or ''
                title = tags.get('title') or tags.get('handler_name') or ''
                label = title or lang or f'Track {len(sub_streams) + 1}'
                sub_streams.append({'index': stream['index'], 'lang': lang, 'label': label})
        if 'duration' not in info:
            dur = data.get('format', {}).get('duration')
            if dur:
                info['duration'] = float(dur)
        if sub_streams:
            info['_sub_streams'] = sub_streams
        return info
    except Exception:
        return {}


@lru_cache(maxsize=256)
def _audio_info_sync(path: str, mtime: float) -> dict:
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(path)
        if audio is None:
            return {}
        result = {}
        if hasattr(audio, 'info') and audio.info and hasattr(audio.info, 'length'):
            result['duration'] = audio.info.length
        tags = getattr(audio, 'tags', None)
        if tags is not None:
            for field, key in [('title', 'TIT2'), ('artist', 'TPE1'), ('album', 'TALB')]:
                val = tags.get(key)
                if val:
                    result[field] = str(val)
            for field, key in [('title', '\xa9nam'), ('artist', '\xa9ART'), ('album', '\xa9alb')]:
                if field not in result and key in tags:
                    val = tags[key]
                    if val:
                        result[field] = str(val[0])
            for field in ('title', 'artist', 'album'):
                if field not in result and field in tags:
                    val = tags[field]
                    if val:
                        result[field] = str(val[0]) if isinstance(val, list) else str(val)
        cover_data = _extract_cover_data(audio)
        if cover_data:
            with Image.open(io.BytesIO(cover_data)) as img:
                result['img_w'], result['img_h'] = img.size
        return result
    except Exception:
        return {}


SUBTITLE_EXTS = {'.srt', '.vtt', '.ass', '.ssa'}


def _srt_to_vtt(text: str) -> str:
    vtt = re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', text)
    return 'WEBVTT\n\n' + vtt.strip()


def _ass_time(t: str) -> str:
    try:
        h, m, s = t.strip().split(':')
        s_int, cs = s.split('.')
        return f'{int(h):02d}:{int(m):02d}:{int(s_int):02d}.{int(cs) * 10:03d}'
    except Exception:
        return ''


def _ass_to_vtt(text: str) -> str:
    lines = ['WEBVTT', '']
    format_cols: list[str] = []
    in_events = False
    for line in text.splitlines():
        s = line.strip()
        if s == '[Events]':
            in_events = True
        elif in_events and s.startswith('Format:'):
            format_cols = [c.strip() for c in s[7:].split(',')]
        elif in_events and s.startswith('Dialogue:') and format_cols:
            parts = s[9:].split(',', len(format_cols) - 1)
            if len(parts) == len(format_cols):
                row = dict(zip(format_cols, parts))
                start = _ass_time(row.get('Start', ''))
                end = _ass_time(row.get('End', ''))
                txt = re.sub(r'\{[^}]*\}', '', row.get('Text', ''))
                txt = txt.replace('\\N', '\n').replace('\\n', '\n').strip()
                if start and end and txt:
                    lines += [f'{start} --> {end}', txt, '']
    return '\n'.join(lines)


def _find_subtitle_files(path, entry_path: str) -> list:
    from urllib.parse import quote
    parent = path.parent
    stem = path.stem
    entry_parent = entry_path.rsplit('/', 1)[0] if '/' in entry_path else ''
    result = []
    try:
        for f in sorted(parent.iterdir()):
            if f.suffix.lower() not in SUBTITLE_EXTS:
                continue
            f_lower = f.stem.lower()
            stem_lower = stem.lower()
            if f_lower == stem_lower or f_lower.startswith(stem_lower + '.'):
                extra = f.stem[len(stem):]
                lang = extra.lstrip('.') or 'und'
                label = lang if lang != 'und' else f.stem
                sub_path = f'{entry_parent}/{f.name}' if entry_parent else f.name
                result.append({
                    'label': label,
                    'lang': '' if lang == 'und' else lang,
                    'url': f'/api/media/subtitle?path={quote(sub_path, safe="")}',
                })
    except Exception:
        pass
    return result


@router.get("/subtitle")
def get_subtitle(path: str = Query(...), stream: int = Query(None)):
    file_path = validate_path(path)
    suffix = file_path.suffix.lower()

    if stream is not None:
        if suffix not in VIDEO_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Not a video file")
        try:
            r = subprocess.run(
                ['ffmpeg', '-i', str(file_path),
                 '-map', f'0:{stream}', '-f', 'webvtt', 'pipe:1', '-loglevel', 'quiet'],
                capture_output=True, timeout=30,
            )
            if not r.stdout:
                raise HTTPException(status_code=404, detail="No subtitle data")
            content = r.stdout.decode('utf-8', errors='replace')
            if not content.strip().startswith('WEBVTT'):
                content = 'WEBVTT\n\n' + content
            return Response(content=content, media_type='text/vtt; charset=utf-8',
                            headers={'Cache-Control': 'no-cache'})
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if suffix not in SUBTITLE_EXTS:
        raise HTTPException(status_code=400, detail="Not a subtitle file")
    try:
        text = file_path.read_text(encoding='utf-8-sig', errors='replace')
        if suffix == '.vtt':
            content = text
        elif suffix == '.srt':
            content = _srt_to_vtt(text)
        else:
            content = _ass_to_vtt(text)
        return Response(content=content, media_type='text/vtt; charset=utf-8',
                        headers={'Cache-Control': 'no-cache'})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _video_entry_enricher(path, entry_path: str, mtime: float) -> dict:
    from urllib.parse import quote
    info = _video_info_sync(str(path), mtime)
    result = {
        'thumbnail_url': f'/api/media/thumbnail?path={quote(entry_path, safe="")}',
        **{k: v for k, v in info.items() if not k.startswith('_')},
    }
    subs = []
    for s in info.get('_sub_streams', []):
        subs.append({
            'label': s['label'],
            'lang':  s['lang'],
            'url':   f'/api/media/subtitle?path={quote(entry_path, safe="")}&stream={s["index"]}',
        })
    subs.extend(_find_subtitle_files(path, entry_path))
    if subs:
        result['subtitles'] = subs
    return result


def _audio_entry_enricher(path, entry_path: str, mtime: float) -> dict:
    from urllib.parse import quote
    info = _audio_info_sync(str(path), mtime)
    return {
        'thumbnail_url': f'/api/media/thumbnail?path={quote(entry_path, safe="")}',
        **info,
    }


@router.get("/thumbnail")
async def get_media_thumbnail(request: Request, path: str = Query(...), size: int = Query(300)):
    file_path = validate_path(path)
    suffix = file_path.suffix.lower()
    if suffix not in VIDEO_MIME_TYPES and suffix not in AUDIO_MIME_TYPES:
        raise HTTPException(status_code=404, detail="Not a media file")
    try:
        mtime = file_path.stat().st_mtime
        etag = f'"{mtime}"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        data = await asyncio.to_thread(_generate_media_thumbnail, str(file_path), suffix, size, mtime)
        if data is None:
            raise HTTPException(status_code=404, detail="No thumbnail available")
        return Response(content=data, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache", "ETag": etag})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail")


async def setup(ctx):
    ft_registry = ctx.services.get("file-type.registry")
    ft_registry.register_enricher("video", _video_entry_enricher, PLUGIN_ID)
    ft_registry.register_enricher("audio", _audio_entry_enricher, PLUGIN_ID)
    ctx.app.include_router(router, prefix="/api/media", tags=["media"])


async def teardown(ctx):
    ctx.services.get("file-type.registry").unregister_plugin(PLUGIN_ID)
