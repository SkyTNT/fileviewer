import os
from pathlib import Path

IMAGE_EXTENSIONS   = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}
PARQUET_EXTENSIONS = {".parquet"}
JSON_EXTENSIONS    = {".json"}
JSONL_EXTENSIONS   = {".jsonl"}
TEXT_EXTENSIONS    = {".txt", ".yaml", ".yml", ".toml", ".md", ".ini", ".conf", ".log",
                      ".xml", ".html", ".css", ".js", ".ts", ".py", ".sh", ".csv",
                      ".rst", ".cfg", ".env", ".tex", ".r", ".sql"}


def get_root() -> Path:
    return Path(os.environ.get("FILE_VIEWER_ROOT", ".")).resolve()


def validate_path(rel_path: str) -> Path:
    """Accept a relative path, resolve against ROOT, block traversal. Returns absolute Path."""
    from fastapi import HTTPException
    try:
        root = get_root()
        # normpath collapses ".." without following symlinks
        normalized = Path(os.path.normpath(root / rel_path.lstrip("/")))
        root_str = str(root)
        norm_str = str(normalized)
        if not (norm_str == root_str or norm_str.startswith(root_str + os.sep)):
            raise HTTPException(status_code=403, detail="Access denied")
        return normalized
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def to_rel(abs_path: Path) -> str:
    """Convert absolute path back to forward-slash relative path (empty string = root)."""
    root = get_root()
    try:
        rel = abs_path.relative_to(root)
        s = str(rel).replace(os.sep, "/")
        return "" if s == "." else s
    except ValueError:
        return ""


def _dtype_to_node(name: str, dtype) -> dict:
    """Recursively convert a polars dtype to a serialisable tree node."""
    node = {"name": name, "dtype": str(dtype)}
    # Struct types expose a .fields attribute (list of polars.Field)
    fields = getattr(dtype, "fields", None)
    if fields:
        node["fields"] = [_dtype_to_node(f.name, f.dtype) for f in fields]
    return node


def schema_to_tree(schema) -> list[dict]:
    """Convert a polars Schema to a nested list suitable for JSON."""
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
    return "unknown"
