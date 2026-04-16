import os
import re
import concurrent.futures
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from fileviewer.config import parse_path, build_entry_path, get_file_type, get_roots

_FILTER_MAX_LEN = 200

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


def build_tree(p: Path, remaining: int, slug: "str | None", root: Path, sort_by: str = "name", sort_order: str = "asc") -> dict:
    node = entry_info(p, slug, root)
    if p.is_dir() and remaining > 0:
        children = []
        try:
            def dir_key(e):
                if sort_by == "modified":
                    try:
                        return e.stat().st_mtime or 0
                    except (PermissionError, OSError):
                        return 0
                return e.name.lower()

            with os.scandir(p) as it:
                dirs = sorted(
                    (e for e in it if e.is_dir()),
                    key=dir_key,
                    reverse=(sort_order == "desc"),
                )
            for entry in dirs:
                children.append(build_tree(Path(entry.path), remaining - 1, slug, root, sort_by, sort_order))
        except PermissionError:
            pass
        node["children"] = children
    return node


_VALID_SORT = {"name", "size", "modified", "type"}


@router.get("/list")
def list_directory(
    path: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    filter: str | None = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
):
    # Home page — RootsView handles display, no file listing needed.
    if not path:
        return {"path": "", "entries": [], "total": 0, "page": 1, "page_size": 0}

    abs_path, slug, root = parse_path(path)
    if not abs_path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    pattern = None
    if filter:
        if len(filter) > _FILTER_MAX_LEN:
            raise HTTPException(status_code=400, detail=f"Filter pattern too long (max {_FILTER_MAX_LEN} chars)")
        try:
            pattern = re.compile(filter)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")
        # Guard against catastrophic backtracking (ReDoS)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as exe:
            try:
                exe.submit(pattern.search, "a" * 100 + "!").result(timeout=1.0)
            except concurrent.futures.TimeoutError:
                raise HTTPException(status_code=400, detail="Filter pattern is too complex")

    if sort_by not in _VALID_SORT:
        sort_by = "name"
    reverse = sort_order == "desc"

    def dir_key(e):
        if sort_by == "modified":
            try:
                return e.stat().st_mtime or 0
            except (PermissionError, OSError):
                return 0
        return e.name.lower()  # name / size / type → fall back to name for dirs

    def file_key(e):
        if sort_by == "name":
            return e.name.lower()
        try:
            st = e.stat()
        except (PermissionError, OSError):
            return 0 if sort_by in ("size", "modified") else ""
        if sort_by == "size":
            return st.st_size
        if sort_by == "modified":
            return st.st_mtime or 0
        if sort_by == "type":
            return Path(e.path).suffix.lower()
        return e.name.lower()  # name

    try:
        with os.scandir(abs_path) as it:
            raw = [e for e in it if pattern is None or pattern.search(e.name)]
    except PermissionError:
        raw = []

    # Dirs and files sorted independently so dir_key/file_key can return different types.
    # Dirs always come first.
    dirs  = sorted([e for e in raw if     e.is_dir()], key=dir_key,  reverse=reverse)
    files = sorted([e for e in raw if not e.is_dir()], key=file_key, reverse=reverse)
    all_entries = dirs + files

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
def get_tree(path: str = Query(""), depth: int = Query(1), sort_by: str = Query("name"), sort_order: str = Query("asc")):
    if not path:
        children = []
        for slug, display_name, abs_path in get_roots():
            node = build_tree(abs_path, depth - 1, slug, abs_path, sort_by, sort_order)
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
    return build_tree(abs_path, depth, slug, root, sort_by, sort_order)


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
