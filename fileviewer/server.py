import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fileviewer.routers import files, images, parquet_reader, text_reader
from fileviewer.routers import media, write_ops, hex_reader

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="File Viewer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router,          prefix="/api/files",   tags=["files"])
app.include_router(images.router,         prefix="/api/images",  tags=["images"])
app.include_router(parquet_reader.router, prefix="/api/parquet", tags=["parquet"])
app.include_router(text_reader.router,    prefix="/api/text",    tags=["text"])
app.include_router(media.router,          prefix="/api/media",   tags=["media"])
app.include_router(write_ops.router,      prefix="/api/write",   tags=["write"])
app.include_router(hex_reader.router,     prefix="/api/hex",     tags=["hex"])


@app.get("/api/root")
def get_root_info():
    """Return only the display name of the root directory, not its real path."""
    root = Path(os.environ.get("FILE_VIEWER_ROOT", ".")).resolve()
    return {"name": root.name or "/"}


@app.get("/api/config")
def get_config():
    return {"write_mode": bool(os.environ.get("FILE_VIEWER_WRITE"))}


if STATIC_DIR.exists() and any(STATIC_DIR.iterdir()):
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
