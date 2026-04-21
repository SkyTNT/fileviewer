from dataclasses import dataclass
from fastapi import FastAPI
from kernel.service_registry import ServiceRegistry
from kernel.event_bus import EventBus
import logging


class _WrappedApp:
    """FastAPI wrapper that tracks registered route prefixes to detect conflicts."""

    def __init__(self, app: FastAPI):
        self._app = app
        self._prefixes: set[str] = set()

    def include_router(self, router, prefix: str, **kwargs):
        if prefix in self._prefixes:
            raise RuntimeError(f"Route prefix '{prefix}' already registered")
        self._prefixes.add(prefix)
        self._app.include_router(router, prefix=prefix, **kwargs)

    def __getattr__(self, name):
        return getattr(self._app, name)


@dataclass
class PluginContext:
    plugin_id: str
    services: ServiceRegistry
    events: EventBus
    app: _WrappedApp
    logger: logging.Logger
