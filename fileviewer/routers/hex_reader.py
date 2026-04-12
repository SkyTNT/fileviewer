from fastapi import APIRouter, Query, HTTPException
from fileviewer.config import validate_path

router = APIRouter()

BYTES_PER_ROW = 16
ROWS_PER_PAGE = 512   # 8 KB per page


@router.get("/dump")
def get_hex_dump(path: str = Query(...), page: int = Query(1, ge=1)):
    file_path = validate_path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")

    file_size   = file_path.stat().st_size
    page_bytes  = BYTES_PER_ROW * ROWS_PER_PAGE
    offset      = (page - 1) * page_bytes
    total_pages = max(1, (file_size + page_bytes - 1) // page_bytes)

    with file_path.open("rb") as f:
        f.seek(offset)
        data = f.read(page_bytes)

    rows = []
    for i in range(0, len(data), BYTES_PER_ROW):
        chunk = data[i : i + BYTES_PER_ROW]
        rows.append({
            "offset": offset + i,
            "hex":    [f"{b:02x}" for b in chunk],
            "ascii":  "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in chunk),
        })

    return {
        "rows":        rows,
        "file_size":   file_size,
        "page":        page,
        "total_pages": total_pages,
    }
