import asyncio
import importlib.util
import logging
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from kernel.context import PluginContext, _WrappedApp
from kernel.event_bus import EventBus
from kernel.manifest import PluginMeta, load_manifest
from kernel.service_registry import ServiceRegistry


class PluginManager:
    def __init__(self, app: FastAPI, services: ServiceRegistry, events: EventBus):
        self._app = _WrappedApp(app)
        self._services = services
        self._events = events
        self._plugins: dict[str, Any] = {}   # plugin_id -> module
        self._metas: dict[str, PluginMeta] = {}

    async def load_all(self, plugin_dirs: list[Path]) -> None:
        metas: list[PluginMeta] = []
        for d in plugin_dirs:
            for sub in sorted(d.iterdir()):
                toml = sub / "plugin.toml"
                if not toml.exists():
                    continue
                meta = load_manifest(sub)
                if meta.enabled:
                    metas.append(meta)

        # Load all modules first (synchronous, order-independent)
        modules = {meta.id: self._load_module(meta) for meta in metas}

        # Run all setup() functions concurrently.
        # Each plugin calls ctx.services.get_async() for its dependencies, which
        # waits until the providing plugin registers the service — no explicit
        # ordering or plugin.toml requires declarations needed.
        await asyncio.gather(*[self._setup_one(meta, modules[meta.id]) for meta in metas])

    async def _setup_one(self, meta: PluginMeta, module: Any) -> None:
        ctx = PluginContext(
            plugin_id=meta.id,
            services=self._services,
            events=self._events,
            app=self._app,
            logger=logging.getLogger(f"plugin.{meta.id}"),
        )
        await module.setup(ctx)
        self._plugins[meta.id] = module
        self._metas[meta.id] = meta
        logging.getLogger("kernel").info(f"Plugin loaded: {meta.id}")

    def _load_module(self, meta: PluginMeta):
        plugin_py = meta.dir / "plugin.py"
        spec = importlib.util.spec_from_file_location(f"plugins.{meta.id}", plugin_py)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"plugins.{meta.id}"] = module
        spec.loader.exec_module(module)
        return module

    def get(self, plugin_id: str):
        return self._plugins.get(plugin_id)

    def list_all(self) -> list[PluginMeta]:
        return list(self._metas.values())
