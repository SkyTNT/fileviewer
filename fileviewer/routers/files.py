import os
import re
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from fileviewer.config import validate_path, get_file_type, to_rel, get_roots, is_multi_root

router = APIRouter()


def entry_info(p: Path) -> dict:
    try:
        stat = p.stat()
        return {
            "name": p.name,
            "path": to_rel(p),
            "type": get_file_type(p),
            "size": stat.st_size if p.is_file() else None,
            "modified": stat.st_mtime,
            "is_dir": p.is_dir(),
            "extension": p.suffix.lower() if p.is_file() else None,
        }
    except PermissionError:
        return {
            "name": p.name,
            "path": to_rel(p),
            "type": "unknown",
            "size": None,
            "modified": None,
            "is_dir": p.is_dir(),
            "extension": p.suffix.lower() if p.is_file() else None,
        }


def build_tree(p: Path, remaining: int) -> dict:
    node = entry_info(p)
    if p.is_dir() and remaining > 0:
        children = []
        try:
            for child in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                if child.is_dir():
                    children.append(build_tree(child, remaining - 1))
        except PermissionError:
            pass
        node["children"] = children
    return node


@router.get("/list")
def list_directory(
    path: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    filter: str | None = Query(None),
):
    # Multi-root virtual root listing
    if is_multi_root() and not path:
        entries = []
        for slug, display_name, abs_path in get_roots():
            try:
                stat = abs_path.stat()
                modified = stat.st_mtime
            except Exception:
                modified = None
            entries.append({
                "name": display_name,
                "path": slug,
                "type": "directory",
                "size": None,
                "modified": modified,
                "is_dir": True,
                "extension": None,
            })
        return {"path": "", "entries": entries, "total": len(entries), "page": 1, "page_size": len(entries)}

    dir_path = validate_path(path)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    pattern = None
    if filter:
        try:
            pattern = re.compile(filter)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")

    try:
        with os.scandir(dir_path) as it:
            all_entries = sorted(
                (e for e in it if pattern is None or pattern.search(e.name)),
                key=lambda e: (not e.is_dir(), e.name.lower()),
            )
    except PermissionError:
        all_entries = []

    total = len(all_entries)
    start = (page - 1) * page_size
    page_entries = [entry_info(Path(e.path)) for e in all_entries[start : start + page_size]]

    return {
        "path": to_rel(dir_path),
        "entries": page_entries,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tree")
def get_tree(path: str = Query(""), depth: int = Query(1)):
    # Multi-root virtual root tree
    if is_multi_root() and not path:
        children = []
        for slug, display_name, abs_path in get_roots():
            node = build_tree(abs_path, depth - 1)
            node["name"] = display_name  # use custom display name
            children.append(node)
        return {
            "name": "Home", "path": "", "type": "directory",
            "size": None, "modified": None, "is_dir": True, "extension": None,
            "children": children,
        }

    dir_path = validate_path(path)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    return build_tree(dir_path, depth)


@router.get("/download")
def download_file(path: str = Query(...)):
    file_path = validate_path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream",
    )

