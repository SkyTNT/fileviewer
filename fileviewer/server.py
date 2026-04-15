import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fileviewer.routers import files, images, dataframe_reader, text_reader
from fileviewer.routers import media, write_ops, hex_reader, auth, archive
from fileviewer import auth_state

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="File Viewer API")

_cors_origins_env = os.environ.get("FILE_VIEWER_CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Only protect /api/* routes; let static files and auth endpoints through
    if not path.startswith("/api/") or path.startswith("/api/auth/"):
        return await call_next(request)
    if auth_state.auth_required():
        token = request.cookies.get("fv_token")
        if not auth_state.verify_token(token):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


app.include_router(auth.router,           prefix="/api/auth",    tags=["auth"])
app.include_router(files.router,          prefix="/api/files",   tags=["files"])
app.include_router(images.router,         prefix="/api/images",  tags=["images"])
app.include_router(dataframe_reader.router, prefix="/api/dataframe", tags=["dataframe"])
app.include_router(text_reader.router,    prefix="/api/text",    tags=["text"])
app.include_router(media.router,          prefix="/api/media",   tags=["media"])
app.include_router(write_ops.router,      prefix="/api/write",   tags=["write"])
app.include_router(hex_reader.router,     prefix="/api/hex",     tags=["hex"])
app.include_router(archive.router,        prefix="/api/archive", tags=["archive"])


@app.get("/api/config")
def get_config():
    from fileviewer.config import get_roots, get_disk_usage
    return {
        "write_mode": os.environ.get("FILE_VIEWER_WRITE", "").lower() not in ("", "0", "false", "no"),
        "roots": [
            {"slug": slug, "name": name, "disk": get_disk_usage(path)}
            for slug, name, path in get_roots()
        ],
    }


if STATIC_DIR.exists() and any(STATIC_DIR.iterdir()):
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
