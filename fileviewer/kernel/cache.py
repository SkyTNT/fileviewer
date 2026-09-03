"""Cache helpers shared by plugins.

Normally these behave like plain `functools.lru_cache` / `async_lru.alru_cache`.
In low-memory mode (`FILE_VIEWER_LOW_MEMORY`), cached values are instead kept in a
size-bounded disk cache under the OS temp directory, so large thumbnail/metadata
caches don't grow the process's resident memory.
"""
import ctypes
import functools
import importlib.metadata
import platform
import shutil
import tempfile
from pathlib import Path

from fileviewer.config import is_low_memory

CACHE_ROOT = Path(tempfile.gettempdir()) / "fileviewer-cache"

_version_checked = False

_libc = None
if platform.system() == "Linux":
    try:
        _libc = ctypes.CDLL("libc.so.6")
    except OSError:
        pass


def trim_memory() -> None:
    """Ask glibc to release freed heap back to the OS.

    After decoding a large image, glibc's malloc often keeps the freed arena space
    around instead of returning it (its mmap threshold grows dynamically, so large
    frees just get pooled for reuse) — so RSS creeps up across requests even though
    nothing is actually leaked at the Python level. Only worth the syscall in
    low-memory mode, where bounded RSS is the whole point; call after any
    large-buffer decode (image/PSD thumbnails, full-res renders).
    """
    global _libc
    if _libc is None or not is_low_memory():
        return
    try:
        _libc.malloc_trim(0)
    except AttributeError:
        # `libc.so.6` opened but has no malloc_trim export — e.g. it's actually musl
        # (Alpine and similar), which has no `libc.so.6` soname of its own but can still
        # resolve that name to something else, and doesn't implement this glibc-only
        # extension at all. Disable permanently rather than retrying every call.
        _libc = None


def _current_version() -> str:
    try:
        return importlib.metadata.version("fileviewer")
    except importlib.metadata.PackageNotFoundError:
        return "0"


def _ensure_cache_version() -> None:
    """Wipe the whole disk cache when it was written by a different app version.

    The cache stores raw function results keyed only by (path, mtime, ...) — if a
    cached function's return shape changes between versions, a stale entry from a
    previous install would otherwise be served as-is after an upgrade.
    """
    global _version_checked
    if _version_checked:
        return
    _version_checked = True
    version_file = CACHE_ROOT / "VERSION"
    try:
        stored = version_file.read_text().strip() if version_file.exists() else None
    except OSError:
        stored = None
    version = _current_version()
    if stored != version:
        shutil.rmtree(CACHE_ROOT, ignore_errors=True)
        CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        version_file.write_text(version)


def _make_key(args, kwargs):
    return args if not kwargs else (args, tuple(sorted(kwargs.items())))


def _disk_cache(name: str, size_limit_mb: int):
    import diskcache
    _ensure_cache_version()
    directory = CACHE_ROOT / name
    directory.mkdir(parents=True, exist_ok=True)
    return diskcache.Cache(str(directory), size_limit=size_limit_mb * 1024 * 1024,
                           eviction_policy="least-recently-used")


def cached(name: str, maxsize: int, disk_size_limit_mb: int = 128, allow_disk: bool = True):
    """Sync cache decorator.

    `allow_disk=False` is for results that can't be pickled to disk (e.g. a
    `polars.LazyFrame`) — in low-memory mode caching is simply skipped for these.
    """
    def decorator(func):
        if not is_low_memory():
            return functools.lru_cache(maxsize=maxsize)(func)
        if not allow_disk:
            @functools.wraps(func)
            def passthrough(*args, **kwargs):
                return func(*args, **kwargs)
            passthrough.cache_clear = lambda: None
            return passthrough

        cache = _disk_cache(name, disk_size_limit_mb)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = _make_key(args, kwargs)
            sentinel = object()
            result = cache.get(key, default=sentinel)
            if result is not sentinel:
                return result
            result = func(*args, **kwargs)
            cache.set(key, result)
            return result
        wrapper.cache_clear = cache.clear
        return wrapper
    return decorator


def async_cached(name: str, maxsize: int, disk_size_limit_mb: int = 128):
    """Async cache decorator (mirrors `async_lru.alru_cache`)."""
    def decorator(func):
        if not is_low_memory():
            from async_lru import alru_cache
            return alru_cache(maxsize=maxsize)(func)

        cache = _disk_cache(name, disk_size_limit_mb)

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            key = _make_key(args, kwargs)
            sentinel = object()
            result = cache.get(key, default=sentinel)
            if result is not sentinel:
                return result
            result = await func(*args, **kwargs)
            cache.set(key, result)
            return result
        wrapper.cache_clear = cache.clear
        return wrapper
    return decorator
