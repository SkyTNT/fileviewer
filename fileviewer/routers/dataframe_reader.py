import asyncio
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx
import polars as pl
from fastapi import APIRouter, Query, HTTPException

from fileviewer.config import (
    validate_path, schema_to_tree,
    JSONL_EXTENSIONS, CSV_EXTENSIONS, IMAGE_EXTENSIONS,
)

router = APIRouter()


# ── Lazy frame loading ────────────────────────────────────────────────────────

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


# ── Schema / data ─────────────────────────────────────────────────────────────

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
            sql_str = filter_sql.strip()
            ctx = pl.SQLContext({"df": lf})
            if re.match(r'^\s*SELECT\b', sql_str, re.IGNORECASE):
                lf = ctx.execute(sql_str, eager=False)
            else:
                lf = ctx.execute(f"SELECT * FROM df WHERE {sql_str}", eager=False)

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


# ── Image column detection ────────────────────────────────────────────────────

async def _is_image_url(client: httpx.AsyncClient, url: str) -> bool:
    try:
        resp = await client.head(url, timeout=5, follow_redirects=True)
        ct = resp.headers.get("content-type", "").split(";")[0].strip()
        return ct.startswith("image/")
    except Exception:
        return False


async def _classify_image_col(client: httpx.AsyncClient, vals: list[str]) -> str | None:
    """Return 'path', 'url', or None based on sampled values."""
    path_hits = 0
    url_vals, other_vals = [], []
    for v in vals:
        v = v.strip()
        if v.startswith(("http://", "https://")):
            url_vals.append(v)
        else:
            if Path(v).suffix.lower() in IMAGE_EXTENSIONS and os.path.isfile(v):
                path_hits += 1
            other_vals.append(v)

    url_checks = await asyncio.gather(*[_is_image_url(client, u) for u in url_vals])
    url_hits = sum(url_checks)

    total = len(vals)
    if path_hits / total >= 0.5:
        return "path"
    if url_hits / total >= 0.5:
        return "url"
    return None


@router.get("/detect-image-cols")
async def detect_image_cols(path: str = Query(...)):
    file_path = validate_path(path)
    try:
        lf = get_lazy_frame(str(file_path))
        schema = lf.collect_schema()
        str_cols = [c for c, t in schema.items() if t == pl.String]
        if not str_cols:
            return {"image_cols": []}

        sample = lf.select(str_cols).limit(10).collect()

        async with httpx.AsyncClient(headers={"User-Agent": "Mozilla/5.0"}) as client:
            async def classify_col(col: str) -> tuple[str, str | None]:
                vals = [v for v in sample[col].drop_nulls().to_list() if isinstance(v, str) and v.strip()]
                if not vals:
                    return col, None
                return col, await _classify_image_col(client, vals)

            results = await asyncio.gather(*[classify_col(col) for col in str_cols])

        image_cols = [{"col": col, "kind": kind} for col, kind in results if kind]
        return {"image_cols": image_cols}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

