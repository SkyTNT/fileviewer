from typing import Any


class ServiceNotFoundError(Exception):
    pass


class ServiceConflictError(Exception):
    pass


class ServiceRegistry:
    def __init__(self):
        self._services: dict[str, tuple[Any, str]] = {}  # name -> (impl, plugin_id)

    def register(self, name: str, impl: Any, plugin_id: str) -> None:
        if name in self._services:
            raise ServiceConflictError(f"Service '{name}' already registered by '{self._services[name][1]}'")
        self._services[name] = (impl, plugin_id)

    def unregister(self, name: str, plugin_id: str) -> None:
        entry = self._services.get(name)
        if entry and entry[1] == plugin_id:
            del self._services[name]

    def get(self, name: str) -> Any:
        entry = self._services.get(name)
        if entry is None:
            raise ServiceNotFoundError(f"Service '{name}' not found — check manifest requires.services")
        return entry[0]

    def unregister_plugin(self, plugin_id: str) -> None:
        to_remove = [k for k, (_, pid) in self._services.items() if pid == plugin_id]
        for k in to_remove:
            del self._services[k]
