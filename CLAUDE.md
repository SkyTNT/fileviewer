# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

FileViewer is a plugin-based file browser and viewer. The Python/FastAPI backend serves filesystem data; the Vue 3/Vuetify frontend renders it. Both sides mirror the same plugin architecture (service registry, event bus, plugin manager).
Design principle: **kernel minimized, domain cohesion, clear plugin↔plugin and plugin↔kernel boundaries.**

## Commands

**Frontend:**
```bash
pnpm install        # install deps
pnpm run dev        # Vite dev server (proxies /api → localhost:8001)
pnpm run build      # build to static/
```

**Backend:**
```bash
pip install -e .              # install CLI in editable mode
pip install -e ".[archive]"   # include py7zr for archive support
fileviewer /path --port 8001 --write  # run the app
```

**Dev workflow:** run `pnpm run dev` + `fileviewer .` simultaneously; the Vite dev server proxies API requests.

## Architecture

### Backend (Python)

Entry points: `cli.py` (arg parsing, sets env vars, launches uvicorn) → `server.py` (FastAPI app with lifespan startup).

On startup, `server.py` initializes a **service registry** and **event bus**, then the **plugin manager** loads all `plugins/*/plugin.py` files. Plugins are topologically sorted by declared `requires`/`provides` in their `plugin.toml`. Each plugin registers FastAPI routes and services.

Key env vars (set by CLI args):
- `FILE_VIEWER_ROOTS` — `"path1|name1;path2|name2"`
- `FILE_VIEWER_WRITE` — `"1"` enables mutations
- `FILE_VIEWER_USER` / `FILE_VIEWER_PASS` — basic auth
- `FILE_VIEWER_CORS_ORIGINS` — comma-separated CORS origins

### Frontend (JavaScript)

Entry: `index.html` → `main.js` → creates Vue app with Vuetify + i18n, then a **Kernel** (service registry, event bus, plugin manager). Plugins are dynamically imported from `./plugins/*/index.js`.

The frontend kernel exposes registries consumed by plugins:
- **App Registry** — maps file types to viewer components (priority-based)
- **Layout Registry** — list, waterfall, etc.
- **Action Registry** — context menus and detail panels
- **Toolbar Registry** — toolbar buttons
- **Plugin Slots** — UI injection points: `app.login`, `sidebar.top`, `toolbar`, `content.layout`, `windows`, `taskbar`, `notifications`

i18n: vue-i18n, supports `en`, `zh-CN`, `zh-TW`, `ja`. Plugins extend messages via their own locale files.

### Plugin Structure

Every plugin lives in `plugins/<name>/` with this layout:
```
plugin.toml     # id, version, enabled, provides[], requires[]
plugin.py       # backend: FastAPI routes + service registrations
index.js        # frontend: kernel plugin initialization
manifest.js     # frontend: plugin metadata
```

Notable plugins: `fs_local` (filesystem I/O), `explorer` (core browser UI), `auth`, `archive` (ZIP/TAR/7Z via py7zr), `dataframe` (CSV/Parquet via Polars), `image`, `media`, `hex`.

### Build Output

`pnpm run build` outputs to `static/` with Vite-chunked JS (`vuetify.js`, `codemirror.js`, `vendor.js`, `main.js`) + hash-based filenames. The FastAPI app serves `static/` as static files.
