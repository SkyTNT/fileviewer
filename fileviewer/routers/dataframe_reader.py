from functools import lru_cache
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
import polars as pl
from fileviewer.config import validate_path, schema_to_tree, JSONL_EXTENSIONS, CSV_EXTENSIONS

router = APIRouter()


@lru_cache(maxsize=32)
def _load_lazy_frame(abs_path: str, mtime: float) -> pl.LazyFrame:
    suffix = Path(abs_path).suffix.lower()
    if suffix in JSONL_EXTENSIONS:
        return pl.scan_ndjson(abs_path)
    if suffix in CSV_EXTENSIONS:
        sample = pl.read_csv(
            abs_path,
            n_rows=100,
            null_values=["", "NA", "NaN", "nan", "null"],
            truncate_ragged_lines=True,
        )
        rename_map = {c: c.strip() for c in sample.columns if c != c.strip()}
        schema_overrides = {}
        for orig_col in sample.columns:
            if sample[orig_col].dtype == pl.String:
                stripped = sample[orig_col].str.strip_chars()
                casted = stripped.cast(pl.Float64, strict=False)
                if casted.is_null().sum() <= stripped.is_null().sum():
                    schema_overrides[orig_col] = pl.Float64
        lf = pl.scan_csv(
            abs_path,
            schema_overrides=schema_overrides,
            null_values=["", "NA", "NaN", "nan", "null"],
            truncate_ragged_lines=True,
        )
        if rename_map:
            lf = lf.rename(rename_map)
        return lf
    return pl.scan_parquet(abs_path)


def get_lazy_frame(abs_path: str) -> pl.LazyFrame:
    mtime = Path(abs_path).stat().st_mtime
    return _load_lazy_frame(abs_path, mtime)


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
