from typing import Optional
from fastapi import APIRouter, Query, HTTPException
import polars as pl
from fileviewer.config import validate_path, schema_to_tree

router = APIRouter()
_lf_cache: dict[str, pl.LazyFrame] = {}


def get_lazy_frame(abs_path: str) -> pl.LazyFrame:
    if abs_path not in _lf_cache:
        if abs_path.lower().endswith(('.jsonl', '.ndjson')):
            _lf_cache[abs_path] = pl.scan_ndjson(abs_path)
        else:
            _lf_cache[abs_path] = pl.scan_parquet(abs_path)
    return _lf_cache[abs_path]


@router.get("/schema")
def get_schema(path: str = Query(...)):
    file_path = validate_path(path)
    try:
        lf = get_lazy_frame(str(file_path))
        schema = lf.collect_schema()
        return {
            "columns": list(schema.keys()),
            "dtypes": [str(v) for v in schema.values()],
            "schema_tree": schema_to_tree(schema),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data")
def get_data(
    path: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=10000),
    filter_sql: Optional[str] = Query(None),
    sort_col: Optional[str] = Query(None),
    sort_asc: bool = Query(True),
):
    file_path = validate_path(path)
    try:
        lf = get_lazy_frame(str(file_path))

        if filter_sql and filter_sql.strip():
            ctx = pl.SQLContext({"df": lf})
            lf = ctx.execute(f"SELECT * FROM df WHERE {filter_sql}", eager=False)

        if sort_col:
            lf = lf.sort(sort_col, descending=not sort_asc)

        total = lf.select(pl.len()).collect().item()
        offset = (page - 1) * page_size
        chunk = lf.slice(offset, page_size).collect()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "columns": chunk.columns,
            "dtypes": [str(dt) for dt in chunk.dtypes],
            "data": chunk.to_dicts(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
