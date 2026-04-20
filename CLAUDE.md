# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend (use pnpm, never npm):**
```sh
pnpm dev          # dev server with HMR (proxies /api → localhost:8001)
pnpm build        # build Vue app to static/
pnpm preview      # preview production build
```

**Backend:**
```sh
fileviewerv2 [path] --host 127.0.0.1 --port 8001   # run server
uvicorn server:app --reload                        # dev mode with reload
```
Options: `--write`, `--user <u>`, `--password <p>`, `--no-browser`, `--name <label>`

**Full dev setup:** run `pnpm dev` and `uvicorn server:app --reload` concurrently. Vite proxies `/api` to `:8001`.

## Architecture

FileViewer v2 is a plugin-based file browser: a Vue 3 + Vuetify 3 SPA over a FastAPI backend. Both sides use a symmetric plugin kernel.
Design principle: **kernel minimized, domain cohesion, clear plugin↔plugin and plugin↔kernel boundaries.**

### Dual Kernel (JS + Python, mirrored)

`/kernel/` exists in both JS and Python with matching interfaces:
- **ServiceRegistry** — DI container; plugins declare `provides.services` and `requires.services`
- **EventBus** — pub/sub for cross-plugin communication
- **PluginManager** — loads plugins in dependency order (Kahn's topological sort, circular dep detection)
- Each plugin exposes `setup(ctx)` and optional `teardown(ctx)`

JS plugins: `manifest.js` declares metadata/deps; `index.js` runs `setup(ctx)`.  
Python plugins: `plugin.toml` declares metadata/deps; `plugin.py` runs `setup(ctx)`.

### Plugin Extension Points (Frontend)

Plugins extend the UI without coupling via registries on `ctx`:
- `app.registry` — file opener: `{ match(file), component }` (priority fallback)
- `toolbar.registry`, `action.registry` — toolbar buttons and context menu actions
- `layout.registry` — content layout engines
- `slot.host` — inject Vue components into named slots: `sidebar.top`, `toolbar`, `content.layout`, `windows`, `task.panel`, `notifications`
- `file-type.registry` — map extensions to MIME-like type names

### Plugin Extension Points (Backend)

- `ctx.app.include_router(router, prefix="/api/[plugin]")` — mount FastAPI router
- Backend plugins wrap FastAPI via `_WrappedApp` to detect route conflicts

### Key Plugins

| ID | Purpose |
|----|---------|
| `explorer` | File browser: sidebar tree, toolbar, list/grid views |
| `text` | Text/JSON/Markdown viewer (CodeMirror 6) |
| `dataframe` | CSV/Parquet/JSONL viewer (Polars on backend) |
| `image` | Image viewer (Pillow on backend) |
| `media` | Audio/video streaming |
| `hex` | Hex dump viewer |
| `archive` | ZIP/7z reader |
| `fs-ops` | File operations (copy, move, delete) |
| `upload` | File upload |
| `auth` | Optional HTTP basic auth middleware |

### Path Security

All file access goes through `config.py`: `parse_path()` → `validate_path()` → `_check_under()`. This prevents directory traversal. Roots are set via env var `FILE_VIEWER_ROOTS` (semicolon-separated `path|display_name`).

### State & i18n

Frontend state is plain Vue `reactive()` objects held in services — no Pinia/Vuex. Components access services via `useService(id)` composable.

i18n: each plugin extends the `i18n` service at setup time with its own locale keys. Supported locales: `en`, `zh-CN`, `zh-TW`, `ja`.

### Write Mode & Auth

Write mode: `FILE_VIEWER_WRITE=1` env var or `--write` CLI flag. Backend checks this per-request; frontend shows indicator.  
Auth: optional; `--user`/`--password` flags set env vars read by the `auth` plugin, which provides an `auth.verify` service that server middleware calls.

### Build Output

`pnpm build` emits to `static/`. FastAPI serves this directory as static files — build before running the server in production.
