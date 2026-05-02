import asyncio
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import polars as pl
from fastapi import APIRouter, Query, HTTPException

from config import validate_path, validate_abs_path

PLUGIN_ID = "dataframe"
router = APIRouter()

PARQUET_EXTENSIONS = {".parquet"}
JSONL_EXTENSIONS   = {".jsonl", ".ndjson"}
JSON_EXTENSIONS    = {".json"}
CSV_EXTENSIONS     = {".csv"}
IMAGE_EXTENSIONS   = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg"}

_http_client = None


def _dtype_to_node(name: str, dtype) -> dict:
    node = {"name": name, "dtype": str(dtype)}
    fields = getattr(dtype, "fields", None)
    if fields:
        node["fields"] = [_dtype_to_node(f.name, f.dtype) for f in fields]
    return node


def schema_to_tree(schema) -> list[dict]:
    return [_dtype_to_node(name, dtype) for name, dtype in schema.items()]


@lru_cache(maxsize=32)
def _load_lazy_frame(abs_path: str, mtime: float) -> pl.LazyFrame:
    suffix = Path(abs_path).suffix.lower()
    if suffix in JSONL_EXTENSIONS:
        return pl.scan_ndjson(abs_path, infer_schema_length=None)
    if suffix in JSON_EXTENSIONS:
        try:
            return pl.scan_ndjson(abs_path, infer_schema_length=None)
        except Exception as exc:
            raise ValueError(f"'{Path(abs_path).name}' could not be read as JSONL/NDJSON: {exc}") from exc
    if suffix in CSV_EXTENSIONS:
        sample = pl.read_csv(abs_path, n_rows=100, null_values=["", "NA", "NaN", "nan", "null"],
                             truncate_ragged_lines=True)
        rename_map = {c: c.strip() for c in sample.columns if c != c.strip()}
        schema_overrides = {}
        for orig_col in sample.columns:
            if sample[orig_col].dtype == pl.String:
                stripped = sample[orig_col].str.strip_chars()
                casted = stripped.cast(pl.Float64, strict=False)
                if casted.is_null().sum() <= stripped.is_null().sum():
                    schema_overrides[orig_col] = pl.Float64
        lf = pl.scan_csv(abs_path, schema_overrides=schema_overrides,
                         null_values=["", "NA", "NaN", "nan", "null"], truncate_ragged_lines=True)
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
        return {"columns": list(schema.keys()), "dtypes": [str(v) for v in schema.values()],
                "schema_tree": schema_to_tree(schema)}
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
            sql_ctx = pl.SQLContext({"df": lf})
            if re.match(r'^\s*SELECT\b', sql_str, re.IGNORECASE):
                lf = sql_ctx.execute(sql_str, eager=False)
            else:
                lf = sql_ctx.execute(f"SELECT * FROM df WHERE {sql_str}", eager=False)
        # Count before sort — sort doesn't affect total, and streaming works without sort in plan.
        try:
            total = lf.select(pl.len()).collect(engine="streaming").item()
        except Exception:
            total = lf.select(pl.len()).collect().item()
        if sort_col:
            lf = lf.sort(sort_col, descending=not sort_asc)
        offset = (page - 1) * page_size
        try:
            chunk = lf.slice(offset, page_size).collect(engine="streaming")
        except Exception:
            chunk = lf.slice(offset, page_size).collect()
        data = chunk.to_dicts()
        for row in data:
            for k, v in row.items():
                if isinstance(v, float) and not math.isfinite(v):
                    row[k] = str(v)
        return {"total": total, "page": page, "page_size": page_size,
                "columns": chunk.columns, "dtypes": [str(dt) for dt in chunk.dtypes], "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _is_image_url(url: str) -> bool:
    try:
        resp = await _http_client.head(url)
        ct = resp.headers.get("content-type", "").split(";")[0].strip()
        return ct.startswith("image/")
    except Exception:
        return False


async def _classify_image_col(vals: list[str]) -> str | None:
    path_hits = 0
    url_vals = []
    for v in vals:
        v = v.strip()
        if v.startswith(("http://", "https://")):
            url_vals.append(v)
        else:
            p = Path(v)
            if p.suffix.lower() in IMAGE_EXTENSIONS and p.is_file():
                try:
                    validate_abs_path(str(p))
                    path_hits += 1
                except Exception:
                    pass
    url_checks = await asyncio.gather(*[_is_image_url(u) for u in url_vals])
    url_hits = sum(url_checks)
    total = len(vals)
    if total == 0:
        return None
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

        async def classify_col(col: str) -> tuple[str, str | None]:
            vals = [v for v in sample[col].drop_nulls().to_list() if isinstance(v, str) and v.strip()]
            if not vals:
                return col, None
            return col, await _classify_image_col(vals)

        results = await asyncio.gather(*[classify_col(col) for col in str_cols])
        image_cols = [{"col": col, "kind": kind} for col, kind in results if kind]
        return {"image_cols": image_cols}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def setup(ctx):
    global _http_client
    import httpx
    _http_client = httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=10.0,
        limits=httpx.Limits(max_connections=100),
    )
    ft_registry = ctx.services.get("file-type.registry")
    ft_registry.register("parquet", list(PARQUET_EXTENSIONS), PLUGIN_ID)
    ft_registry.register("csv",     list(CSV_EXTENSIONS),     PLUGIN_ID)
    ft_registry.register("json",    list(JSON_EXTENSIONS),    PLUGIN_ID)
    ft_registry.register("jsonl",   list(JSONL_EXTENSIONS),   PLUGIN_ID)
    ctx.app.include_router(router, prefix="/api/dataframe", tags=["dataframe"])


async def teardown(ctx):
    global _http_client
    ctx.services.get("file-type.registry").unregister_plugin(PLUGIN_ID)
    if _http_client:
        await _http_client.aclose()
        _http_client = None
