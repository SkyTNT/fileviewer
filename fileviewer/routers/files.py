from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from fileviewer.config import validate_path, get_file_type, to_rel

router = APIRouter()


def entry_info(p: Path) -> dict:
    try:
        stat = p.stat()
        return {
            "name": p.name,
            "path": to_rel(p),          # relative path
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


@router.get("/list")
def list_directory(
    path: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    dir_path = validate_path(path)
    if not dir_path.is_dir():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Not a directory")
    all_entries = []
    try:
        for p in sorted(dir_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            all_entries.append(entry_info(p))
    except PermissionError:
        pass
    total = len(all_entries)
    start = (page - 1) * page_size
    return {
        "path": to_rel(dir_path),
        "entries": all_entries[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tree")
def get_tree(path: str = Query(""), depth: int = Query(1)):
    dir_path = validate_path(path)
    if not dir_path.is_dir():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Not a directory")

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
