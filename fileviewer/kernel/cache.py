"""Cache helpers shared by plugins.

Normally these behave like plain `functools.lru_cache` / `async_lru.alru_cache`.
In low-memory mode (`FILE_VIEWER_LOW_MEMORY`), cached values are instead kept in a
size-bounded disk cache under the OS temp directory, so large thumbnail/metadata
caches don't grow the process's resident memory.
"""
import functools
import tempfile
from pathlib import Path

from fileviewer.config import is_low_memory

CACHE_ROOT = Path(tempfile.gettempdir()) / "fileviewer-cache"


def _make_key(args, kwargs):
    return args if not kwargs else (args, tuple(sorted(kwargs.items())))


def _disk_cache(name: str, size_limit_mb: int):
    import diskcache
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
