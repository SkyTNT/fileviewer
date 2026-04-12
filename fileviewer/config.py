import os
from pathlib import Path

IMAGE_EXTENSIONS   = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}
IMAGE_MIME_TYPES   = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif",  ".webp": "image/webp",  ".bmp": "image/bmp",
    ".svg": "image/svg+xml", ".tiff": "image/tiff", ".tif": "image/tiff",
}
PARQUET_EXTENSIONS = {".parquet"}
CSV_EXTENSIONS     = {".csv"}
JSON_EXTENSIONS    = {".json"}
JSONL_EXTENSIONS   = {".jsonl", ".ndjson"}
TEXT_EXTENSIONS    = {
    ".txt", ".md", ".rst", ".tex", ".log", ".ini", ".conf", ".cfg", ".env",
    ".yaml", ".yml", ".toml",
    ".xml", ".html", ".htm", ".css",
    ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".py", ".sh", ".bash", ".zsh", ".fish",
    ".sql", ".r",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cxx",
    ".java", ".kt", ".kts", ".scala",
    ".go", ".rs", ".swift",
    ".cs", ".vb", ".fs",
    ".rb", ".php", ".pl", ".lua",
    ".dart", ".ex", ".exs", ".erl",
    ".cmake", ".makefile", ".mk", ".dockerfile",
    ".gitignore", ".gitattributes", ".editorconfig",
    ".vue", ".svelte",
}
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

_EXT_TO_TYPE: dict[str, str] = {
    ext: t
    for t, exts in [
        ("image",   IMAGE_EXTENSIONS),
        ("parquet", PARQUET_EXTENSIONS),
        ("csv",     CSV_EXTENSIONS),
        ("json",    JSON_EXTENSIONS),
        ("jsonl",   JSONL_EXTENSIONS),
        ("text",    TEXT_EXTENSIONS),
        ("video",   VIDEO_MIME_TYPES),
        ("audio",   AUDIO_MIME_TYPES),
    ]
    for ext in exts
}


import re

def _to_slug(text: str) -> str:
    """Convert arbitrary text to a URL-safe slug."""
    slug = text.strip().lower()
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "_", slug)  # keep ASCII word chars and CJK
    slug = slug.strip("_")
    return slug or "root"


def _make_slugs(bases: list[str]) -> list[str]:
    """Deduplicate slugs with _2/_3 suffixes."""
    count: dict[str, int] = {}
    for b in bases:
        count[b] = count.get(b, 0) + 1

    idx: dict[str, int] = {}
    slugs: list[str] = []
    for b in bases:
        if count[b] == 1:
            slugs.append(b)
        else:
            idx[b] = idx.get(b, 0) + 1
            slugs.append(f"{b}_{idx[b]}")
    return slugs


def get_roots() -> list[tuple[str, str, Path]]:
    """Return list of (slug, display_name, abs_path) for all configured roots.

    Slugs are URL-safe identifiers. When a custom name is given it is used as
    the slug base; otherwise the directory name is used.

    Environment variable:
      FILE_VIEWER_ROOTS  – semicolon-separated roots; each entry is
                           ``/abs/path`` or ``/abs/path|Display Name``
    """
    roots_env = os.environ.get("FILE_VIEWER_ROOTS", "")
    raw: list[tuple[str | None, Path]] = []
    for part in roots_env.split(";"):
        part = part.strip()
        if not part:
            continue
        if "|" in part:
            path_str, custom_name = part.split("|", 1)
            raw.append((custom_name.strip() or None, Path(path_str.strip()).resolve()))
        else:
            raw.append((None, Path(part).resolve()))
    if not raw:
        raw = [(None, Path(".").resolve())]

    # Use custom name (if any) as slug base, else fall back to directory name
    bases = [_to_slug(custom_name if custom_name else (path.name or "root"))
             for custom_name, path in raw]
    slugs = _make_slugs(bases)

    return [
        (slug, custom_name or (path.name or slug), path)
        for (custom_name, path), slug in zip(raw, slugs)
    ]


def parse_path(rel_path: str) -> tuple[Path, str, Path]:
    """Resolve rel_path and return ``(abs_path, slug, root_abs)``.

    The first path segment is always the root slug; the remainder is the
    sub-path within that root.  An empty rel_path refers to the virtual home
    page and raises 400 — there is no real directory to open there.
    """
    from fastapi import HTTPException

    roots = get_roots()
    try:
        stripped = rel_path.lstrip("/")
        if not stripped:
            raise HTTPException(status_code=400, detail="Path refers to virtual root")
        parts = stripped.split("/", 1)
        slug = parts[0]
        subpath = parts[1] if len(parts) > 1 else ""
        root = next((p for s, _, p in roots if s == slug), None)
        if root is None:
            raise HTTPException(status_code=404, detail=f"Root '{slug}' not found")
        normalized = Path(os.path.normpath(root / subpath))
        _check_under(normalized, root)
        return normalized, slug, root
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def validate_path(rel_path: str) -> Path:
    """Resolve a slug-relative path to an absolute path. Raises 403/404 on invalid input."""
    abs_path, _, _ = parse_path(rel_path)
    return abs_path


def validate_abs_path(abs_path: Path) -> Path:
    """Validate that an absolute OS path is under a configured root.

    Used for paths that originate from data (e.g. values in DataFrame columns)
    rather than from API slug-relative paths.  Raises 403 if not under any root.
    """
    from fastapi import HTTPException
    norm = Path(os.path.normpath(abs_path))
    for _, _, root in get_roots():
        try:
            norm.relative_to(root)
            return norm
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="Access denied")


def build_entry_path(p: Path, slug: "str | None", root: Path) -> str:
    """Build the API path string for *p* using its known root context.

    Using the caller-supplied slug+root avoids searching all roots, which
    would give wrong results when one root is nested inside another.
    """
    rel = str(p.relative_to(root)).replace(os.sep, "/")
    if rel == ".":
        return slug or ""
    return f"{slug}/{rel}" if slug else rel


def get_disk_usage(path: Path) -> "dict | None":
    """Return ``{total, used, free}`` bytes for the partition containing *path*."""
    import shutil
    try:
        u = shutil.disk_usage(path)
        return {"total": u.total, "used": u.used, "free": u.free}
    except Exception:
        return None


def _check_under(normalized: Path, root: Path) -> None:
    from fastapi import HTTPException
    try:
        normalized.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")


def to_rel(abs_path: Path) -> str:
    """Convert absolute path to forward-slash relative path.

    Single-root: relative to root (empty string = root).
    Multi-root:  slug/subpath (just slug = root of that root).
    """
    roots = get_roots()
    if len(roots) == 1:
        _, _, root = roots[0]
        try:
            rel = abs_path.relative_to(root)
            s = str(rel).replace(os.sep, "/")
            return "" if s == "." else s
        except ValueError:
            return ""
    else:
        # Among all roots that contain abs_path, prefer the deepest one
        # so that a root nested inside another root is matched correctly.
        best_slug = None
        best_rel  = None
        best_depth = -1
        for slug, _, root in roots:
            try:
                rel = abs_path.relative_to(root)
                depth = len(root.parts)
                if depth > best_depth:
                    best_depth = depth
                    best_slug  = slug
                    s = str(rel).replace(os.sep, "/")
                    best_rel = slug if s == "." else f"{slug}/{s}"
            except ValueError:
                continue
        return best_rel or ""


def _dtype_to_node(name: str, dtype) -> dict:
    node = {"name": name, "dtype": str(dtype)}
    fields = getattr(dtype, "fields", None)
    if fields:
        node["fields"] = [_dtype_to_node(f.name, f.dtype) for f in fields]
    return node


def schema_to_tree(schema) -> list[dict]:
    return [_dtype_to_node(name, dtype) for name, dtype in schema.items()]


def get_file_type(path: Path) -> str:
    if path.is_dir():
        return "directory"
    return _EXT_TO_TYPE.get(path.suffix.lower(), "unknown")
