import importlib.util
import sys
from pathlib import Path

PLUGIN_ID = "archive"

_router_module = None


def _load_router():
    global _router_module
    if _router_module is None:
        spec = importlib.util.spec_from_file_location(
            "plugins.archive._router",
            Path(__file__).parent / "router.py"
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules["plugins.archive._router"] = mod
        spec.loader.exec_module(mod)
        _router_module = mod
    return _router_module


async def setup(ctx):
    mod = _load_router()
    ctx.services.register("archive.read",         lambda path: None, PLUGIN_ID)
    ctx.services.register("archive.write",        lambda path: None, PLUGIN_ID)
    ctx.services.register("archive.capabilities", mod.get_capabilities, PLUGIN_ID)
    ctx.app.include_router(mod.router, prefix="/api/archive", tags=["archive"])


async def teardown(ctx):
    ctx.services.unregister("archive.read",         PLUGIN_ID)
    ctx.services.unregister("archive.write",        PLUGIN_ID)
    ctx.services.unregister("archive.capabilities", PLUGIN_ID)
