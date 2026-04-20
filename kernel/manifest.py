from pathlib import Path
from dataclasses import dataclass, field

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore


@dataclass
class PluginMeta:
    id: str
    version: str
    name: str
    enabled: bool
    provides_services: list[str]
    requires_services: list[str]
    requires_plugins: list[str]
    dir: Path


def load_manifest(plugin_dir: Path) -> PluginMeta:
    toml_path = plugin_dir / "plugin.toml"
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    p = data["plugin"]
    provides = p.get("provides", {})
    requires = p.get("requires", {})
    return PluginMeta(
        id=p["id"],
        version=p.get("version", "0.0.0"),
        name=p.get("name", p["id"]),
        enabled=p.get("enabled", True),
        provides_services=provides.get("services", []),
        requires_services=requires.get("services", []),
        requires_plugins=requires.get("plugins", []),
        dir=plugin_dir,
    )
