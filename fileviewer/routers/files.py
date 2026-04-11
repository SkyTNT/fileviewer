import os
import re
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from fileviewer.config import parse_path, build_entry_path, get_file_type, get_roots

router = APIRouter()


def entry_info(p: Path, slug: "str | None", root: Path) -> dict:
    path_str = build_entry_path(p, slug, root)
    try:
        stat = p.stat()
        return {
            "name": p.name,
            "path": path_str,
            "type": get_file_type(p),
            "size": stat.st_size if p.is_file() else None,
            "modified": stat.st_mtime,
            "is_dir": p.is_dir(),
            "extension": p.suffix.lower() if p.is_file() else None,
        }
    except (PermissionError, OSError):
        return {
            "name": p.name,
            "path": path_str,
            "type": "unknown",
            "size": None,
            "modified": None,
            "is_dir": False,
            "extension": p.suffix.lower(),
        }


def build_tree(p: Path, remaining: int, slug: "str | None", root: Path) -> dict:
    node = entry_info(p, slug, root)
    if p.is_dir() and remaining > 0:
        children = []
        try:
            for child in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                if child.is_dir():
                    children.append(build_tree(child, remaining - 1, slug, root))
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
    # Home page — RootsView handles display, no file listing needed.
    if not path:
        return {"path": "", "entries": [], "total": 0, "page": 1, "page_size": 0}

    abs_path, slug, root = parse_path(path)
    if not abs_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    pattern = None
    if filter:
        try:
            pattern = re.compile(filter)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")

    try:
        with os.scandir(abs_path) as it:
            all_entries = sorted(
                (e for e in it if pattern is None or pattern.search(e.name)),
                key=lambda e: (not e.is_dir(), e.name.lower()),
            )
    except PermissionError:
        all_entries = []

    total = len(all_entries)
    start = (page - 1) * page_size
    page_entries = [entry_info(Path(e.path), slug, root) for e in all_entries[start: start + page_size]]

    return {
        "path": build_entry_path(abs_path, slug, root),
        "entries": page_entries,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tree")
def get_tree(path: str = Query(""), depth: int = Query(1)):
    if not path:
        children = []
        for slug, display_name, abs_path in get_roots():
            node = build_tree(abs_path, depth - 1, slug, abs_path)
            node["name"] = display_name
            children.append(node)
        return {
            "name": "Home", "path": "", "type": "directory",
            "size": None, "modified": None, "is_dir": True, "extension": None,
            "children": children,
        }

    abs_path, slug, root = parse_path(path)
    if not abs_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    return build_tree(abs_path, depth, slug, root)


@router.get("/download")
def download_file(path: str = Query(...)):
    file_path, _, _ = parse_path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream",
    )
