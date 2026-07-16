"""Kernel built-in services registered before any plugin loads."""
from collections import defaultdict


class FileTypeRegistry:
    """Maps file extensions to fileType strings. Plugins extend this at setup()."""

    def __init__(self):
        self._map: dict[str, str] = {}
        self._plugin_exts: dict[str, list[str]] = defaultdict(list)
        self._enrichers: dict[str, list[tuple]] = defaultdict(list)
        # each tuple: (fn, plugin_id), fn(path: Path, entry_path: str, mtime: float) -> dict

    def register(self, file_type: str, extensions: list[str], plugin_id: str) -> None:
        for ext in extensions:
            self._map[ext.lower()] = file_type
            self._plugin_exts[plugin_id].append(ext.lower())

    def register_enricher(self, file_type: str, fn, plugin_id: str) -> None:
        self._enrichers[file_type].append((fn, plugin_id))

    def enrich_entry(self, file_type: str, path, entry_path: str, mtime: float) -> dict:
        extras: dict = {}
        for fn, _ in self._enrichers.get(file_type, []):
            try:
                result = fn(path, entry_path, mtime)
                if result:
                    extras.update(result)
            except Exception:
                pass
        return extras

    def unregister_plugin(self, plugin_id: str) -> None:
        for ext in self._plugin_exts.pop(plugin_id, []):
            self._map.pop(ext, None)
        for file_type, entries in list(self._enrichers.items()):
            self._enrichers[file_type] = [(fn, pid) for fn, pid in entries if pid != plugin_id]

    def get_type(self, filename_or_extension: str) -> str | None:
        """Return the registered type for an extension or a complete filename.

        Matching registered extensions by descending length supports compound
        suffixes (for example, ``.tar.gz``) without making filesystem providers
        aware of any particular file format.
        """
        value = filename_or_extension.lower()
        if file_type := self._map.get(value):
            return file_type
        for extension in sorted(self._map, key=len, reverse=True):
            if value.endswith(extension):
                return self._map[extension]
        return None


def register_builtins(services, config_roots_fn) -> None:
    """Register kernel built-in services into the ServiceRegistry."""
    services.register("file-type.registry", FileTypeRegistry(), "kernel")
    services.register("config.roots", config_roots_fn, "kernel")
