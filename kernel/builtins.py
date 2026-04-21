"""Kernel built-in services registered before any plugin loads."""
from collections import defaultdict


class FileTypeRegistry:
    """Maps file extensions to fileType strings. Plugins extend this at setup()."""

    def __init__(self):
        self._map: dict[str, str] = {}
        self._plugin_exts: dict[str, list[str]] = defaultdict(list)

    def register(self, file_type: str, extensions: list[str], plugin_id: str) -> None:
        for ext in extensions:
            self._map[ext.lower()] = file_type
            self._plugin_exts[plugin_id].append(ext.lower())

    def unregister_plugin(self, plugin_id: str) -> None:
        for ext in self._plugin_exts.pop(plugin_id, []):
            self._map.pop(ext, None)

    def get_type(self, ext: str) -> str | None:
        return self._map.get(ext.lower())


def register_builtins(services, config_roots_fn) -> None:
    """Register kernel built-in services into the ServiceRegistry."""
    services.register("file-type.registry", FileTypeRegistry(), "kernel")
    services.register("config.roots", config_roots_fn, "kernel")
