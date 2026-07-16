"""Pure utility functions: path validation, slug generation, disk usage.
No business logic — plugins own their domain knowledge."""
import os
import re
import shutil
from pathlib import Path


def _to_slug(text: str) -> str:
    slug = text.strip().lower()
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "_", slug)
    slug = slug.strip("_")
    return slug or "root"


def _make_slugs(bases: list[str]) -> list[str]:
    count: dict[str, int] = {}
    result = []
    for b in bases:
        if b not in count:
            count[b] = 0
            result.append(b)
        else:
            count[b] += 1
            result.append(f"{b}_{count[b]}")
    return result


def get_roots() -> list[tuple[str, str, Path]]:
    raw = os.environ.get("FILE_VIEWER_ROOTS", "")
    entries = [e.strip() for e in raw.split(";") if e.strip()]
    if not entries:
        entries = ["."]
    parsed = []
    for e in entries:
        if "|" in e:
            path_str, name = e.split("|", 1)
        else:
            path_str = e
            name = Path(e).name or e
        parsed.append((Path(path_str).resolve(), name.strip()))
    bases = [_to_slug(name) for _, name in parsed]
    slugs = _make_slugs(bases)
    return [(slug, name, path) for (path, name), slug in zip(parsed, slugs)]


def _check_under(normalized: Path, root: Path) -> None:
    from fastapi import HTTPException
    try:
        normalized.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")


def parse_path(rel_path: str) -> tuple[Path, str, Path]:
    """Split 'slug/sub/path' into (abs_path, slug, root_abs_path)."""
    from fastapi import HTTPException
    parts = rel_path.lstrip("/").split("/", 1)
    slug = parts[0]
    sub = parts[1] if len(parts) > 1 else ""
    roots = get_roots()
    match = next((r for r in roots if r[0] == slug), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Root '{slug}' not found")
    _, _, root_abs = match
    if sub:
        abs_path = Path(os.path.normpath(root_abs / sub))
    else:
        abs_path = root_abs
    _check_under(abs_path, root_abs)
    return abs_path, slug, root_abs


def validate_path(rel_path: str) -> Path:
    abs_path, _, _ = parse_path(rel_path)
    return abs_path


def validate_abs_path(abs_path_str: str) -> Path:
    from fastapi import HTTPException
    p = Path(abs_path_str).resolve()
    roots = get_roots()
    for _, _, root in roots:
        try:
            p.relative_to(root)
            return p
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="Access denied")


def build_entry_path(p: Path, slug: str | None, root: Path) -> str:
    if slug is None:
        return str(p).replace('\\', '/')
    try:
        rel = p.relative_to(root)
        rel_str = str(rel).replace('\\', '/')
        return f"{slug}/{rel_str}" if rel_str != "." else slug
    except ValueError:
        return str(p)


def get_disk_usage(path: Path) -> dict | None:
    try:
        u = shutil.disk_usage(path)
        return {"total": u.total, "used": u.used, "free": u.free}
    except Exception:
        return None


def require_write() -> None:
    from fastapi import HTTPException
    import os
    if os.environ.get("FILE_VIEWER_WRITE", "").lower() in ("", "0", "false", "no"):
        raise HTTPException(status_code=403, detail="Write mode not enabled")
