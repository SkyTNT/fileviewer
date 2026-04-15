# fileviewer

A web-based file browser and viewer with a modern UI. Browse local directories, view files of many formats, and optionally manage files — all from your browser.

## Features

### File browsing
- **Multi-root** — expose one or more directories with custom display names
- **Two view modes** — masonry waterfall grid and detailed list view
- **Directory tree** sidebar for quick navigation
- **Sorting** — by name, size, modified date, or type (ascending/descending); affects all views including the directory tree
- **Regex filter** — filter the current directory by filename pattern
- **Rubber-band selection** — drag to select multiple files; also Shift+click and Ctrl+click

### File viewers
- **Text** — syntax highlighting for 50+ languages via CodeMirror; inline editing with Ctrl+S save in write mode
- **Images** — thumbnail grid, full-resolution pan/zoom viewer, side-by-side comparison slider
- **Tabular data** — Parquet, CSV, JSON, JSONL powered by Polars with SQL `WHERE` filter, sorting, schema browser, and image column preview
- **Archives** — browse zip, tar, tar.gz, tar.bz2, tar.xz, 7z; random-access preview (zip/7z); extract here or to subfolder; create archives with compression level and password
- **Video & audio** — HTTP range streaming
- **Markdown** — rendered preview with source toggle
- **Hex dump** — paged hex viewer for binary files

### File management (write mode)
- Create, rename, delete files and directories
- Upload via drag & drop onto the file area or file picker
- Copy/move with conflict resolution: overwrite, skip, or keep both
- Cut/copy/paste with clipboard indicator
- Compress files and directories into archives
- Copy images directly to the system clipboard
- Real-time progress for bulk operations via Server-Sent Events

### Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| Ctrl+A | Select all visible files |
| Ctrl+C | Copy selected files |
| Ctrl+X | Cut selected files |
| Ctrl+V | Paste clipboard |
| Delete | Delete selected files |
| F5 | Refresh |
| ←/→ | Navigate to prev/next image (in image viewer) |

### Other
- **Authentication** — optional username/password login with HttpOnly session cookies
- **Internationalization** — English, Simplified Chinese, Traditional Chinese, Japanese
- **Theme** — light/dark mode and customizable accent color

## Installation

```bash
pip install fileviewer
```

## Quick Start

```bash
# Browse the current directory
fileviewer

# Browse a specific directory
fileviewer /path/to/dir

# Browse multiple directories with display names
fileviewer /data /projects --name Data Projects

# Enable write mode
fileviewer /path/to/dir --write

# Require login
fileviewer /path/to/dir --user admin --password secret

# Custom host and port
fileviewer /path/to/dir --host 0.0.0.0 --port 9000

# Don't auto-open browser
fileviewer /path/to/dir --no-browser
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `paths` | `.` | One or more root directories to browse |
| `--name NAME [NAME ...]` | directory name | Display names for root directories (one per path, in order) |
| `--host HOST` | `127.0.0.1` | Host to bind to |
| `--port PORT` | `8000` | Port to listen on |
| `--write` | off | Enable file write operations |
| `--user USER` | — | Username for authentication |
| `--password PASS` | — | Password for authentication |
| `--no-browser` | off | Do not open browser on startup |

## Tech Stack

**Backend:** Python 3.10+, FastAPI, Uvicorn, Polars, Pillow

**Frontend:** Vue 3, Vuetify 3, Pinia, CodeMirror 6, Vite

## Development

```bash
# Backend (runs on port 8001)
uvicorn fileviewer.server:app --reload --port 8001

# Frontend (runs on port 5173, proxies /api to backend)
cd frontend
pnpm install
pnpm dev
```

Build for production:

```bash
cd frontend
pnpm build      # outputs to fileviewer/static/
cd ..
pip install .
```

## Security Notes

- All paths are validated against the configured root directories — no directory traversal is possible.
- Write operations are disabled by default.
- Auth tokens are stored in HttpOnly, SameSite cookies.

## License

See [LICENSE](LICENSE).
