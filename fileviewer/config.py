import os
from pathlib import Path

IMAGE_EXTENSIONS   = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}
PARQUET_EXTENSIONS = {".parquet"}
JSON_EXTENSIONS    = {".json"}
JSONL_EXTENSIONS   = {".jsonl"}
TEXT_EXTENSIONS    = {
    ".txt", ".md", ".rst", ".tex", ".csv", ".log", ".ini", ".conf", ".cfg", ".env",
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
VIDEO_EXTENSIONS   = {".mp4", ".webm", ".ogv", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".m4v", ".ts"}
AUDIO_EXTENSIONS   = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".opus", ".wma"}


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


def is_multi_root() -> bool:
    return len(get_roots()) > 1


def get_root() -> Path:
    """Return the single root path (backward-compat helper)."""
    return get_roots()[0][2]


def validate_path(rel_path: str) -> Path:
    """Resolve a relative path against the appropriate root; block traversal.

    Single-root: path is relative to the one root.
    Multi-root:  first segment is the slug; remainder is the sub-path.
    """
    from fastapi import HTTPException

    roots = get_roots()

    try:
        if len(roots) == 1:
            _, _, root = roots[0]
            normalized = Path(os.path.normpath(root / rel_path.lstrip("/")))
            _check_under(normalized, root)
            return normalized
        else:
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
            return normalized

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _check_under(normalized: Path, root: Path) -> None:
    from fastapi import HTTPException
    root_str = str(root)
    norm_str = str(normalized)
    prefix = root_str if root_str.endswith(os.sep) else root_str + os.sep
    if not (norm_str == root_str.rstrip(os.sep) or norm_str.startswith(prefix)):
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
    suffix = path.suffix.lower()
    if suffix in IMAGE_EXTENSIONS:    return "image"
    if suffix in PARQUET_EXTENSIONS:  return "parquet"
    if suffix in JSON_EXTENSIONS:     return "json"
    if suffix in JSONL_EXTENSIONS:    return "jsonl"
    if suffix in TEXT_EXTENSIONS:     return "text"
    if suffix in VIDEO_EXTENSIONS:    return "video"
    if suffix in AUDIO_EXTENSIONS:    return "audio"
    return "unknown"
