import asyncio
import json
import os
import pathlib
import tempfile
import threading
import time
import zipfile
import tarfile
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from config import validate_path, require_write

router = APIRouter()

try:
    import py7zr
    HAS_7Z = True
except ImportError:
    HAS_7Z = False

import pyzipper

_ARCHIVE_EXTS: dict[str, str] = {
    '.zip':     'zip',
    '.tar':     'tar',
    '.tar.gz':  'tar.gz',
    '.tgz':     'tar.gz',
    '.tar.bz2': 'tar.bz2',
    '.tbz2':    'tar.bz2',
    '.tar.xz':  'tar.xz',
    '.txz':     'tar.xz',
}
if HAS_7Z:
    _ARCHIVE_EXTS['.7z'] = '7z'

_RANDOM_ACCESS = {'zip'}
if HAS_7Z:
    _RANDOM_ACCESS.add('7z')


def _file_size(p: pathlib.Path) -> int:
    try:
        return p.stat().st_size
    except OSError:
        return 0


def _detect_fmt(path: pathlib.Path) -> str | None:
    name = path.name.lower()
    for ext in sorted(_ARCHIVE_EXTS, key=len, reverse=True):
        if name.endswith(ext):
            return _ARCHIVE_EXTS[ext]
    return None


def _entry(name: str, path: str, size: int, compressed: int,
           is_dir: bool, modified: datetime | None) -> dict:
    return {
        'name': name,
        'path': path,
        'size': size,
        'compressed_size': compressed,
        'is_dir': is_dir,
        'modified': modified.isoformat() if modified else None,
    }


# ── Listers ───────────────────────────────────────────────────────────────────

def _list_zip(p: pathlib.Path, pwd: str | None) -> list[dict]:
    bpwd = pwd.encode() if pwd else None
    try:
        with zipfile.ZipFile(p, 'r') as zf:
            out = []
            for info in zf.infolist():
                try:
                    dt = datetime(*info.date_time) if info.date_time else None
                except Exception:
                    dt = None
                nm = pathlib.PurePosixPath(info.filename).name or info.filename.rstrip('/')
                out.append(_entry(nm, info.filename, info.file_size,
                                  info.compress_size, info.filename.endswith('/'), dt))
            return out
    except RuntimeError as e:
        if 'password' in str(e).lower():
            raise HTTPException(422, 'Password required or incorrect')
        raise HTTPException(400, str(e))
    except zipfile.BadZipFile as e:
        raise HTTPException(400, f'Invalid ZIP file: {e}')


def _list_tar(p: pathlib.Path) -> list[dict]:
    try:
        with tarfile.open(p, 'r:*') as tf:
            out = []
            for m in tf.getmembers():
                nm = pathlib.PurePosixPath(m.name).name or m.name
                modified = datetime.fromtimestamp(m.mtime) if m.mtime else None
                out.append(_entry(nm, m.name, m.size, m.size, m.isdir(), modified))
            return out
    except tarfile.TarError as e:
        raise HTTPException(400, f'Invalid TAR file: {e}')


def _list_7z(p: pathlib.Path, pwd: str | None) -> list[dict]:
    try:
        with py7zr.SevenZipFile(p, 'r', password=pwd) as z:
            out = []
            for info in z.list():
                nm = pathlib.PurePosixPath(info.filename).name or info.filename
                out.append(_entry(
                    nm,
                    info.filename,
                    getattr(info, 'uncompressed', 0) or 0,
                    getattr(info, 'compressed', 0) or 0,
                    getattr(info, 'is_directory', False),
                    getattr(info, 'creationtime', None),
                ))
            return out
    except Exception as e:
        msg = str(e).lower()
        if 'password' in msg or 'encrypted' in msg:
            raise HTTPException(422, 'Password required or incorrect')
        raise HTTPException(400, f'Invalid 7Z file: {e}')


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get('/info')
def get_info(path: str = Query(...), password: str | None = Query(None)):
    p = validate_path(path)
    if not p.exists():
        raise HTTPException(404, 'File not found')
    fmt = _detect_fmt(p)
    if not fmt:
        raise HTTPException(400, 'Unsupported archive format')

    def gen():
        random_access = fmt in _RANDOM_ACCESS
        encrypted = False

        if fmt == 'zip':
            try:
                with zipfile.ZipFile(p) as zf:
                    encrypted = any(bool(i.flag_bits & 0x1) for i in zf.infolist()[:5])
            except Exception:
                pass
        elif fmt == '7z' and HAS_7Z:
            try:
                with py7zr.SevenZipFile(p, 'r') as z:
                    encrypted = z.needs_password()
            except Exception:
                pass

        yield _sse({'type': 'meta', 'format': fmt, 'random_access': random_access, 'encrypted': encrypted})

        count = 0

        if fmt == 'zip':
            try:
                with zipfile.ZipFile(p, 'r') as zf:
                    for info in zf.infolist():
                        try:
                            dt = datetime(*info.date_time) if info.date_time else None
                        except Exception:
                            dt = None
                        nm = pathlib.PurePosixPath(info.filename).name or info.filename.rstrip('/')
                        yield _sse({'type': 'entry', **_entry(
                            nm, info.filename, info.file_size,
                            info.compress_size, info.filename.endswith('/'), dt)})
                        count += 1
            except RuntimeError as e:
                if 'password' in str(e).lower():
                    yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'})
                    return
                yield _sse({'type': 'error', 'message': str(e)})
                return
            except zipfile.BadZipFile as e:
                yield _sse({'type': 'error', 'message': f'Invalid ZIP file: {e}'})
                return

        elif fmt in ('tar', 'tar.gz', 'tar.bz2', 'tar.xz'):
            try:
                with tarfile.open(p, 'r:*') as tf:
                    for m in tf:  # iterates one header at a time — no need to load all members first
                        nm = pathlib.PurePosixPath(m.name).name or m.name
                        modified = datetime.fromtimestamp(m.mtime) if m.mtime else None
                        yield _sse({'type': 'entry', **_entry(nm, m.name, m.size, m.size, m.isdir(), modified)})
                        count += 1
            except tarfile.TarError as e:
                yield _sse({'type': 'error', 'message': f'Invalid TAR file: {e}'})
                return

        elif fmt == '7z' and HAS_7Z:
            try:
                with py7zr.SevenZipFile(p, 'r', password=password) as z:
                    for info in z.list():
                        nm = pathlib.PurePosixPath(info.filename).name or info.filename
                        yield _sse({'type': 'entry', **_entry(
                            nm, info.filename,
                            getattr(info, 'uncompressed', 0) or 0,
                            getattr(info, 'compressed', 0) or 0,
                            getattr(info, 'is_directory', False),
                            getattr(info, 'creationtime', None))})
                        count += 1
            except Exception as e:
                msg = str(e).lower()
                if 'password' in msg or 'encrypted' in msg:
                    yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'})
                    return
                yield _sse({'type': 'error', 'message': f'Invalid 7Z file: {e}'})
                return

        yield _sse({'type': 'done', 'entry_count': count})

    return _sse_resp(gen())


class ConflictCheckRequest(BaseModel):
    path: str
    dest: str
    password: str | None = None
    entries: list[str] | None = None


@router.post('/conflicts')
def check_conflicts(req: ConflictCheckRequest):
    """Return list of archive entries that already exist in the destination directory."""
    archive_path = validate_path(req.path)
    dest_path    = validate_path(req.dest)
    if not archive_path.exists():
        raise HTTPException(404, 'Archive not found')
    if not dest_path.exists():
        return {'conflicts': []}

    fmt = _detect_fmt(archive_path)
    if not fmt:
        raise HTTPException(400, 'Unsupported archive format')

    try:
        if fmt == 'zip':
            entries_list = _list_zip(archive_path, req.password)
        elif fmt in ('tar', 'tar.gz', 'tar.bz2', 'tar.xz'):
            entries_list = _list_tar(archive_path)
        elif fmt == '7z':
            entries_list = _list_7z(archive_path, req.password)
        else:
            raise HTTPException(400, f'Unsupported format: {fmt}')
    except HTTPException:
        raise

    conflicts = []
    for entry in entries_list:
        if entry['is_dir']:
            continue
        if req.entries is not None and not _matches(entry['path'], req.entries):
            continue
        if (dest_path / pathlib.PurePosixPath(entry['path'])).exists():
            conflicts.append({'name': entry['path']})

    return {'conflicts': conflicts}


@router.get('/entry')
def get_entry(
    path: str = Query(...),
    entry: str = Query(...),
    password: str | None = Query(None),
):
    """Serve a single file from a random-access archive with appropriate Content-Type."""
    import mimetypes
    from urllib.parse import quote

    p = validate_path(path)
    fmt = _detect_fmt(p)
    if not fmt:
        raise HTTPException(400, 'Unsupported archive format')
    if fmt not in _RANDOM_ACCESS:
        raise HTTPException(400, 'Format does not support random access')

    entry_clean = entry.replace('\\', '/').lstrip('/')
    content: bytes | None = None

    if fmt == 'zip':
        bpwd = password.encode() if password else None
        try:
            with zipfile.ZipFile(p, 'r') as zf:
                content = zf.read(entry_clean, pwd=bpwd)
        except KeyError:
            raise HTTPException(404, 'Entry not found')
        except RuntimeError as e:
            if 'password' in str(e).lower():
                raise HTTPException(422, 'Password required or incorrect')
            # AES-encrypted ZIP (pyzipper-created) — standard zipfile raises
            # NotImplementedError (subclass of RuntimeError) without 'password'
            try:
                with pyzipper.AESZipFile(p, 'r') as zf:
                    if bpwd:
                        zf.setpassword(bpwd)
                    content = zf.read(entry_clean)
            except KeyError:
                raise HTTPException(404, 'Entry not found')
            except Exception as e2:
                if 'password' in str(e2).lower():
                    raise HTTPException(422, 'Password required or incorrect')
                raise HTTPException(400, str(e2))

    elif fmt == '7z':
        try:
            with py7zr.SevenZipFile(p, 'r', password=password) as z:
                data = z.read(targets=[entry_clean])
                if not data or entry_clean not in data:
                    raise HTTPException(404, 'Entry not found')
                content = data[entry_clean].read()
        except HTTPException:
            raise
        except Exception as e:
            msg = str(e).lower()
            if 'password' in msg:
                raise HTTPException(422, 'Password required or incorrect')
            raise HTTPException(400, str(e))

    if content is None:
        raise HTTPException(404, 'Entry not found')

    mime_type, _ = mimetypes.guess_type(entry_clean)
    if not mime_type:
        if content[:8] == b'\x89PNG\r\n\x1a\n':
            mime_type = 'image/png'
        elif content[:2] == b'\xff\xd8':
            mime_type = 'image/jpeg'
        elif content[:6] in (b'GIF87a', b'GIF89a'):
            mime_type = 'image/gif'
        elif len(content) > 12 and content[:4] == b'RIFF' and content[8:12] == b'WEBP':
            mime_type = 'image/webp'
        else:
            try:
                content[:512].decode('utf-8')
                mime_type = 'text/plain; charset=utf-8'
            except (UnicodeDecodeError, ValueError):
                mime_type = 'application/octet-stream'

    filename = pathlib.PurePosixPath(entry_clean).name
    filename_encoded = quote(filename, safe='')
    return Response(
        content=content,
        media_type=mime_type,
        headers={
            'Content-Disposition': f"inline; filename*=UTF-8''{filename_encoded}",
            'Cache-Control': 'no-store',
        },
    )


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _sse_resp(gen):
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _resolve_dest(dest_dir: pathlib.Path, entry_path: str, strategy: str) -> pathlib.Path | None:
    """Return the output path for a file, or None to skip it."""
    out = (dest_dir / pathlib.PurePosixPath(entry_path)).resolve()
    # Guard against path traversal (e.g. ../../etc/passwd in archive member names)
    try:
        out.relative_to(dest_dir.resolve())
    except ValueError:
        return None
    if not out.exists() or strategy == 'overwrite':
        return out
    if strategy == 'skip':
        return None
    # coexist: append (1), (2), … until name is free
    stem, suffix = out.stem, out.suffix
    i = 1
    while True:
        cand = out.with_name(f'{stem} ({i}){suffix}')
        if not cand.exists():
            return cand
        i += 1


def _matches(member_path: str, filter_list: list[str]) -> bool:
    clean = member_path.rstrip('/')
    for f in filter_list:
        fc = f.rstrip('/')
        if clean == fc or clean.startswith(fc + '/'):
            return True
    return False


# ── Extract ───────────────────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    path: str
    dest: str
    password: str | None = None
    entries: list[str] | None = None          # None = all
    conflict_strategy: str = 'overwrite'      # 'overwrite' | 'skip' | 'coexist'


@router.post('/extract')
def extract(req: ExtractRequest, _: None = Depends(require_write)):
    archive_path = validate_path(req.path)
    dest_path    = validate_path(req.dest)
    if not archive_path.exists():
        raise HTTPException(404, 'Archive not found')
    if not dest_path.is_dir():
        raise HTTPException(400, 'Destination is not a directory')
    fmt = _detect_fmt(archive_path)
    if not fmt:
        raise HTTPException(400, 'Unsupported archive format')

    cs = req.conflict_strategy if req.conflict_strategy in ('overwrite', 'skip', 'coexist') else 'overwrite'
    cancelled = threading.Event()

    def gen():
        try:
            if fmt == 'zip':
                yield from _do_extract_zip(archive_path, dest_path, req.password, req.entries, cs, cancelled)
            elif fmt in ('tar', 'tar.gz', 'tar.bz2', 'tar.xz'):
                yield from _do_extract_tar(archive_path, dest_path, req.entries, cs, cancelled)
            elif fmt == '7z':
                yield from _do_extract_7z(archive_path, dest_path, req.password, req.entries, cs, cancelled)
            else:
                yield _sse({'type': 'error', 'message': f'Unsupported format: {fmt}'})
        except Exception as e:
            yield _sse({'type': 'error', 'message': str(e)})
        except GeneratorExit:
            cancelled.set()
            raise
        if not cancelled.is_set():
            yield _sse({'type': 'done'})

    return _sse_resp(gen())


def _do_extract_zip(arc, dest, pwd, filt, strategy='overwrite', cancelled: threading.Event | None = None):
    bpwd = pwd.encode() if pwd else None

    # Detect AES-encrypted ZIP (compress_type 99 = WinZip AES, used by pyzipper)
    use_pyzipper = False
    try:
        with zipfile.ZipFile(arc, 'r') as zf:
            use_pyzipper = any(m.compress_type == 99 for m in zf.infolist()[:10])
    except Exception:
        pass

    opener = (lambda: pyzipper.AESZipFile(arc, 'r')) if use_pyzipper else (lambda: zipfile.ZipFile(arc, 'r'))
    try:
        with opener() as zf:
            if use_pyzipper and bpwd:
                zf.setpassword(bpwd)
            members = zf.infolist()
            if filt is not None:
                members = [m for m in members if _matches(m.filename, filt)]
            total = len(members)
            bytes_total = sum(m.file_size for m in members if not m.filename.endswith('/'))
            bytes_done = 0

            for i, m in enumerate(members):
                if cancelled is not None and cancelled.is_set():
                    break
                is_dir = m.filename.endswith('/')
                if is_dir:
                    dir_path = (dest / pathlib.PurePosixPath(m.filename)).resolve()
                    try:
                        dir_path.relative_to(dest.resolve())
                        dir_path.mkdir(parents=True, exist_ok=True)
                    except ValueError:
                        pass  # skip traversal attempt
                    yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.filename,
                                'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    continue

                if strategy == 'overwrite':
                    try:
                        if use_pyzipper:
                            zf.extract(m, dest)
                        else:
                            zf.extract(m, dest, pwd=bpwd)
                        bytes_done += m.file_size
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.filename,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    except Exception as e:
                        yield _sse({'type': 'error', 'done': i + 1, 'total': total,
                                    'name': m.filename, 'message': str(e)})
                else:
                    out = _resolve_dest(dest, m.filename, strategy)
                    if out is None:
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.filename,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                        continue
                    try:
                        data = zf.read(m.filename) if use_pyzipper else zf.read(m.filename, pwd=bpwd)
                        out.parent.mkdir(parents=True, exist_ok=True)
                        out.write_bytes(data)
                        bytes_done += m.file_size
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.filename,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    except Exception as e:
                        yield _sse({'type': 'error', 'done': i + 1, 'total': total,
                                    'name': m.filename, 'message': str(e)})
    except RuntimeError as e:
        yield _sse({'type': 'error', 'message': str(e)})


def _do_extract_tar(arc, dest, filt, strategy='overwrite', cancelled: threading.Event | None = None):
    try:
        with tarfile.open(arc, 'r:*') as tf:
            members = tf.getmembers()
            if filt is not None:
                members = [m for m in members if _matches(m.name, filt)]
            total = len(members)
            bytes_total = sum(m.size for m in members if not m.isdir())
            bytes_done = 0

            for i, m in enumerate(members):
                if cancelled is not None and cancelled.is_set():
                    break
                if m.isdir():
                    dir_path = (dest / pathlib.PurePosixPath(m.name)).resolve()
                    try:
                        dir_path.relative_to(dest.resolve())
                        dir_path.mkdir(parents=True, exist_ok=True)
                    except ValueError:
                        pass  # skip traversal attempt
                    yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.name,
                                'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    continue

                if strategy == 'overwrite':
                    try:
                        try:
                            tf.extract(m, dest, filter='data')
                        except TypeError:
                            tf.extract(m, dest)
                        bytes_done += m.size
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.name,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    except Exception as e:
                        yield _sse({'type': 'error', 'done': i + 1, 'total': total,
                                    'name': m.name, 'message': str(e)})
                else:
                    out = _resolve_dest(dest, m.name, strategy)
                    if out is None:
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.name,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                        continue
                    try:
                        f = tf.extractfile(m)
                        if f:
                            out.parent.mkdir(parents=True, exist_ok=True)
                            out.write_bytes(f.read())
                        bytes_done += m.size
                        yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.name,
                                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
                    except Exception as e:
                        yield _sse({'type': 'error', 'done': i + 1, 'total': total,
                                    'name': m.name, 'message': str(e)})
    except tarfile.TarError as e:
        yield _sse({'type': 'error', 'message': str(e)})


def _do_extract_7z(arc, dest, pwd, filt, strategy='overwrite', cancelled: threading.Event | None = None):
    try:
        with py7zr.SevenZipFile(arc, 'r', password=pwd) as z:
            all_members = z.list()
    except Exception as e:
        msg = str(e).lower()
        yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'} if 'password' in msg else {'type': 'error', 'message': str(e)})
        return

    members = [m for m in all_members if (filt is None or _matches(m.filename, filt))]
    total = len(members)
    bytes_total = sum(getattr(m, 'uncompressed', 0) or 0 for m in members if not getattr(m, 'is_directory', False))

    if strategy == 'overwrite':
        if cancelled is not None and cancelled.is_set():
            return
        try:
            with py7zr.SevenZipFile(arc, 'r', password=pwd) as z:
                if filt is not None:
                    z.extract(path=str(dest), targets=[m.filename for m in members])
                else:
                    z.extractall(path=str(dest))
            bytes_done = 0
            for i, m in enumerate(members):
                if cancelled is not None and cancelled.is_set():
                    break
                bytes_done += getattr(m, 'uncompressed', 0) or 0
                yield _sse({'type': 'progress', 'done': i + 1, 'total': total, 'name': m.filename,
                            'bytes_done': bytes_done, 'bytes_total': bytes_total})
        except Exception as e:
            msg = str(e).lower()
            yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'} if 'password' in msg else {'type': 'error', 'message': str(e)})
        return

    # skip / coexist: split members into direct-extract and conflict groups
    dirs    = [m for m in members if getattr(m, 'is_directory', False)]
    files   = [m for m in members if not getattr(m, 'is_directory', False)]

    direct  = []   # no conflict — extract straight to dest
    renamed = []   # conflict — need renamed destination path

    for m in files:
        out = _resolve_dest(dest, m.filename, strategy)
        if out is None:
            renamed.append((m, None))        # skip
        elif out != dest / pathlib.PurePosixPath(m.filename):
            renamed.append((m, out))         # coexist → renamed path
        else:
            direct.append(m)                 # no conflict

    # Create directories
    for m in dirs:
        dir_path = (dest / pathlib.PurePosixPath(m.filename)).resolve()
        try:
            dir_path.relative_to(dest.resolve())
            dir_path.mkdir(parents=True, exist_ok=True)
        except ValueError:
            pass  # skip traversal attempt

    if cancelled is not None and cancelled.is_set():
        return

    # Bulk-extract the non-conflicting files in one pass
    if direct:
        try:
            with py7zr.SevenZipFile(arc, 'r', password=pwd) as z:
                z.extract(path=str(dest), targets=[m.filename for m in direct])
        except Exception as e:
            msg = str(e).lower()
            yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'} if 'password' in msg else {'type': 'error', 'message': str(e)})
            return

    # Extract conflicting files to a temp dir, then move to resolved paths
    need_read = [m for m, out in renamed if out is not None]
    read_data = {}  # filename -> bytes
    if need_read:
        try:
            with tempfile.TemporaryDirectory() as tmp:
                with py7zr.SevenZipFile(arc, 'r', password=pwd) as z:
                    z.extract(path=tmp, targets=[m.filename for m in need_read])
                for m in need_read:
                    tmp_file = pathlib.Path(tmp) / pathlib.PurePosixPath(m.filename)
                    if tmp_file.exists():
                        read_data[m.filename] = tmp_file.read_bytes()
        except Exception as e:
            msg = str(e).lower()
            yield _sse({'type': 'error', 'code': 'password_required', 'message': 'Password required or incorrect'} if 'password' in msg else {'type': 'error', 'message': str(e)})
            return

    done = 0
    bytes_done = 0
    for m in dirs:
        if cancelled is not None and cancelled.is_set():
            break
        done += 1
        yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': m.filename,
                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
    for m in direct:
        if cancelled is not None and cancelled.is_set():
            break
        done += 1
        bytes_done += getattr(m, 'uncompressed', 0) or 0
        yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': m.filename,
                    'bytes_done': bytes_done, 'bytes_total': bytes_total})
    for m, out in renamed:
        if cancelled is not None and cancelled.is_set():
            break
        done += 1
        if out is None:  # skipped
            yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': m.filename,
                        'bytes_done': bytes_done, 'bytes_total': bytes_total})
            continue
        bio = read_data.get(m.filename)
        if bio is not None:
            try:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(bio)
                bytes_done += getattr(m, 'uncompressed', 0) or 0
                yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': m.filename,
                            'bytes_done': bytes_done, 'bytes_total': bytes_total})
            except Exception as e:
                yield _sse({'type': 'error', 'done': done, 'total': total,
                            'name': m.filename, 'message': str(e)})


# ── Create ────────────────────────────────────────────────────────────────────

class CreateRequest(BaseModel):
    sources: list[str]
    output_path: str
    format: str
    level: int = 6
    password: str | None = None
    excludes: list[str] = []


def _collect_gen(sources: list[pathlib.Path], exclude_abs: set):
    """Yield (path, arc_name) for every *file* under sources, respecting excludes."""
    for src in sources:
        if src in exclude_abs:
            continue
        if src.is_file():
            yield (src, src.name)
        elif src.is_dir():
            base = src.parent
            stack = [src]
            while stack:
                cur = stack.pop()
                try:
                    with os.scandir(cur) as it:
                        for entry in sorted(it, key=lambda e: e.name):
                            ep = pathlib.Path(entry.path)
                            if any(ep == e or str(ep).startswith(str(e) + os.sep) for e in exclude_abs):
                                continue
                            if entry.is_dir(follow_symlinks=False):
                                stack.append(ep)
                            else:
                                rel = ep.relative_to(base)
                                yield (ep, str(rel).replace(os.sep, '/'))
                except OSError:
                    pass


def _collect_scan(sources, exclude_abs):
    """Generator: yields SSE scanning events while collecting files.
    Returns (files, bytes_total) via generator return value (yield from captures it)."""
    files = []
    bytes_total = 0
    last_t = 0.0
    for f, arc_name in _collect_gen(sources, exclude_abs):
        files.append((f, arc_name))
        bytes_total += _file_size(f)
        now = time.monotonic()
        if now - last_t >= 0.2:
            last_t = now
            yield _sse({'type': 'scanning', 'count': len(files)})
    yield _sse({'type': 'scanning', 'count': len(files)})
    return files, bytes_total


@router.post('/create')
async def create(req: CreateRequest, request: Request, _: None = Depends(require_write)):
    out_path = validate_path(req.output_path)

    src_paths: list[pathlib.Path] = []
    for s in req.sources:
        p = validate_path(s)
        if not p.exists():
            raise HTTPException(404, f'Source not found: {s}')
        src_paths.append(p)

    valid = {'zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz'}
    if HAS_7Z:
        valid.add('7z')
    if req.format not in valid:
        raise HTTPException(400, f'Unsupported format: {req.format}')

    exclude_abs: set[pathlib.Path] = set()
    for exc in req.excludes:
        try:
            exclude_abs.add(validate_path(exc))
        except Exception:
            pass

    level = max(0, min(9, req.level))
    cancelled = threading.Event()

    async def _watch_disconnect():
        while not cancelled.is_set():
            if await request.is_disconnected():
                cancelled.set()
                return
            await asyncio.sleep(0.5)

    loop = asyncio.get_running_loop()
    watch_task = asyncio.create_task(_watch_disconnect())

    def gen():
        try:
            if req.format == 'zip':
                yield from _do_create_zip(src_paths, out_path, level, req.password, exclude_abs, cancelled)
            elif req.format in ('tar', 'tar.gz', 'tar.bz2', 'tar.xz'):
                yield from _do_create_tar(src_paths, out_path, req.format, level, exclude_abs, cancelled)
            elif req.format == '7z':
                yield from _do_create_7z(src_paths, out_path, level, req.password, exclude_abs, cancelled)
        except Exception as e:
            yield _sse({'type': 'error', 'message': str(e)})
        except GeneratorExit:
            cancelled.set()
            raise
        finally:
            loop.call_soon_threadsafe(watch_task.cancel)
        if not cancelled.is_set():
            yield _sse({'type': 'done'})

    return _sse_resp(gen())


_CHUNK = 1 << 20  # 1 MB chunks for progress tracking


def _tar_file_with_progress(tf: tarfile.TarFile, f_path: pathlib.Path, arc_name: str,
                             cancel_event: threading.Event):
    """Add one file to a TarFile via addfile() in a worker thread.
    Yields source-byte deltas every ~100 ms so the caller can emit SSE events.
    Respects cancel_event: when set, the reader returns b'' to stop the thread early."""
    info = tf.gettarinfo(str(f_path), arcname=arc_name)

    read_bytes = [0]
    exc        = [None]
    finished   = threading.Event()

    class _Reader:
        def __init__(self, fp): self._fp = fp
        def read(self, n=-1):
            if cancel_event.is_set():
                return b''
            data = self._fp.read(n)
            if data:
                read_bytes[0] += len(data)
            return data

    def _worker():
        try:
            with open(f_path, 'rb') as fp:
                tf.addfile(info, _Reader(fp))
        except Exception as e:
            exc[0] = e
        finally:
            finished.set()

    threading.Thread(target=_worker, daemon=True).start()

    last = 0
    try:
        while not finished.wait(timeout=0.1):
            if cancel_event.is_set():
                finished.wait(timeout=5.0)
                return
            curr = read_bytes[0]
            if curr > last:
                yield curr - last
                last = curr
    except GeneratorExit:
        cancel_event.set()
        finished.wait(timeout=5.0)
        raise

    if exc[0] and not cancel_event.is_set():
        raise exc[0]
    curr = read_bytes[0]
    if curr > last:
        yield curr - last


def _do_create_zip(sources, output, level, pwd, excludes, cancelled: threading.Event):
    files, bytes_total = yield from _collect_scan(sources, excludes)
    total = len(files)
    done = bytes_done = 0
    last_yield_time = 0.0
    completed = False

    if pwd:
        def _open():
            zf = pyzipper.AESZipFile(output, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES)
            zf.setpassword(pwd.encode())
            return zf
    else:
        ct = zipfile.ZIP_DEFLATED if level > 0 else zipfile.ZIP_STORED
        cl = level if level > 0 else None
        def _open():
            return zipfile.ZipFile(output, 'w', compression=ct, compresslevel=cl)

    try:
        with _open() as zf:
            for f, arc_name in files:
                if cancelled.is_set():
                    break
                # ZipFile.open('w') allows chunked writes — no thread needed
                with zf.open(arc_name, 'w', force_zip64=True) as dest:
                    with open(f, 'rb') as src:
                        while True:
                            if cancelled.is_set():
                                break
                            chunk = src.read(_CHUNK)
                            if not chunk:
                                break
                            dest.write(chunk)
                            bytes_done += len(chunk)
                            now = time.monotonic()
                            if now - last_yield_time >= 0.2:
                                last_yield_time = now
                                yield _sse({'type': 'progress', 'done': done, 'total': total,
                                            'name': arc_name, 'bytes_done': bytes_done,
                                            'bytes_total': bytes_total})
                if cancelled.is_set():
                    break
                done += 1
                yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': arc_name,
                            'bytes_done': bytes_done, 'bytes_total': bytes_total})
        if not cancelled.is_set():
            completed = True
    except Exception as e:
        yield _sse({'type': 'error', 'message': str(e)})
    finally:
        if not completed:
            try: output.unlink(missing_ok=True)
            except OSError: pass


def _do_create_tar(sources, output, fmt, level, excludes, cancelled: threading.Event):
    files, bytes_total = yield from _collect_scan(sources, excludes)
    total = len(files)
    mode = {'tar': 'w', 'tar.gz': 'w:gz', 'tar.bz2': 'w:bz2', 'tar.xz': 'w:xz'}.get(fmt, 'w:gz')
    done = bytes_done = 0
    last_yield_time = 0.0
    completed = False
    try:
        with tarfile.open(output, mode) as tf:
            for f, arc_name in files:
                if cancelled.is_set():
                    break
                for delta in _tar_file_with_progress(tf, f, arc_name, cancelled):
                    bytes_done += delta
                    now = time.monotonic()
                    if now - last_yield_time >= 0.2:
                        last_yield_time = now
                        yield _sse({'type': 'progress', 'done': done, 'total': total,
                                    'name': arc_name, 'bytes_done': bytes_done,
                                    'bytes_total': bytes_total})
                if cancelled.is_set():
                    break
                done += 1
                yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': arc_name,
                            'bytes_done': bytes_done, 'bytes_total': bytes_total})
        if not cancelled.is_set():
            completed = True
    except Exception as e:
        yield _sse({'type': 'error', 'message': str(e)})
    finally:
        if not completed:
            try: output.unlink(missing_ok=True)
            except OSError: pass


def _do_create_7z(sources, output, level, pwd, excludes, cancelled: threading.Event):
    files, bytes_total = yield from _collect_scan(sources, excludes)
    total = len(files)
    done = bytes_done = 0
    last_yield_time = 0.0
    completed = False
    try:
        with py7zr.SevenZipFile(str(output), 'w', password=pwd or None) as z:
            for f, arc_name in files:
                if cancelled.is_set():
                    break
                # py7zr has no chunked write API — run in thread, poll output file size
                fsize = _file_size(f)
                exc = [None]
                finished = threading.Event()
                bytes_before = bytes_done

                def _worker(fp=f, an=arc_name):
                    try:   z.write(str(fp), an)
                    except Exception as e: exc[0] = e
                    finally: finished.set()

                threading.Thread(target=_worker, daemon=True).start()
                prev_out = _file_size(output)
                while not finished.wait(timeout=0.1):
                    if cancelled.is_set():
                        finished.wait(timeout=5.0)
                        break
                    cur_out = _file_size(output)
                    if cur_out > prev_out:
                        bytes_done = min(bytes_before + fsize, bytes_done + (cur_out - prev_out))
                        prev_out = cur_out
                    now = time.monotonic()
                    if now - last_yield_time >= 0.2:
                        last_yield_time = now
                        yield _sse({'type': 'progress', 'done': done, 'total': total,
                                    'name': arc_name, 'bytes_done': bytes_done,
                                    'bytes_total': bytes_total})
                if cancelled.is_set():
                    break
                if exc[0]:
                    raise exc[0]
                done       += 1
                bytes_done  = bytes_before + fsize
                yield _sse({'type': 'progress', 'done': done, 'total': total, 'name': arc_name,
                            'bytes_done': bytes_done, 'bytes_total': bytes_total})
        if not cancelled.is_set():
            completed = True
    except Exception as e:
        yield _sse({'type': 'error', 'message': str(e)})
    finally:
        if not completed:
            try: output.unlink(missing_ok=True)
            except OSError: pass


@router.get('/capabilities')
def get_capabilities():
    return {
        'formats': sorted({'zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz'} | ({'7z'} if HAS_7Z else set())),
        '7z_available': HAS_7Z,
    }


