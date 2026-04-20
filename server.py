import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import get_roots, get_disk_usage
from kernel.builtins import register_builtins
from kernel.event_bus import EventBus
from kernel.plugin_manager import PluginManager
from kernel.service_registry import ServiceRegistry

STATIC_DIR = Path(__file__).parent / "static"
PLUGIN_DIR = Path(__file__).parent / "plugins"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    services = ServiceRegistry()
    events = EventBus()
    register_builtins(services, get_roots)

    pm = PluginManager(app, services, events)
    await pm.load_all([PLUGIN_DIR])

    auth_verify = services.get("auth.verify")
    if auth_verify:
        _auth_verify_ref.clear()
        _auth_verify_ref.append(auth_verify)

    if STATIC_DIR.exists() and any(STATIC_DIR.iterdir()):
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    app.state.services = services
    app.state.events = events
    yield


app = FastAPI(title="FileViewer v2 API", lifespan=lifespan)

_cors = [o.strip() for o in os.environ.get("FILE_VIEWER_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors:
    app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

_auth_verify_ref: list = []


@app.middleware("http")
async def _auth(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/") or path.startswith("/api/auth/"):
        return await call_next(request)
    if not _auth_verify_ref or _auth_verify_ref[0](request):
        return await call_next(request)
    return JSONResponse({"detail": "Unauthorized"}, status_code=401)


@app.get("/api/config")
def get_config():
    return {
        "write_mode": os.environ.get("FILE_VIEWER_WRITE", "").lower() not in ("", "0", "false", "no"),
        "roots": [
            {"slug": slug, "name": name, "disk": get_disk_usage(path)}
            for slug, name, path in get_roots()
        ],
    }
