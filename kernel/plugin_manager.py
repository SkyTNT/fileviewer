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


class CircularDependencyError(Exception):
    pass


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

        ordered = self._topo_sort(metas)

        for meta in ordered:
            module = self._load_module(meta)
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

    def _topo_sort(self, metas: list[PluginMeta]) -> list[PluginMeta]:
        # Build service -> plugin_id map from kernel built-ins + plugin provides
        svc_to_plugin: dict[str, str] = {}
        for meta in metas:
            for svc in meta.provides_services:
                svc_to_plugin[svc] = meta.id

        # Resolve service deps to plugin deps
        id_to_meta = {m.id: m for m in metas}
        deps: dict[str, set[str]] = {m.id: set() for m in metas}
        for meta in metas:
            for svc in meta.requires_services:
                provider = svc_to_plugin.get(svc)
                if provider and provider != meta.id:
                    deps[meta.id].add(provider)
            for pid in meta.requires_plugins:
                if pid in id_to_meta:
                    deps[meta.id].add(pid)

        # Kahn's algorithm
        in_degree = {m.id: 0 for m in metas}
        for pid, dep_set in deps.items():
            for dep in dep_set:
                in_degree[pid] += 1

        # Actually: in_degree[node] = number of nodes that node depends on
        # We want nodes with no deps first
        queue = [m.id for m in metas if in_degree[m.id] == 0]
        result = []
        while queue:
            node = queue.pop(0)
            result.append(id_to_meta[node])
            for other in metas:
                if node in deps[other.id]:
                    deps[other.id].discard(node)
                    in_degree[other.id] -= 1
                    if in_degree[other.id] == 0:
                        queue.append(other.id)

        if len(result) != len(metas):
            remaining = [m.id for m in metas if m.id not in {r.id for r in result}]
            raise CircularDependencyError(f"Circular dependency detected among: {remaining}")

        return result

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
