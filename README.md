# fileviewer

A web-based file browser and viewer with a modern UI. Browse local directories, view files of many formats, and optionally manage files — all from your browser.

## Features

- **Multi-root browsing** — expose one or more directories with custom display names
- **Rich file viewers**
  - Text files with syntax highlighting (50+ languages via CodeMirror)
  - Images with thumbnail grid and full-resolution view
  - Tabular data: Parquet, CSV, JSON, JSONL — powered by Polars with SQL filtering
  - Video and audio streaming (HTTP range requests)
  - Markdown rendering
  - Hex dump for binary files
- **File management** (optional write mode)
  - Create, rename, delete files and directories
  - Upload via drag & drop or file picker
  - Copy / move with conflict resolution (overwrite / skip / keep both)
  - Real-time progress via Server-Sent Events
- **Authentication** — optional username/password login with secure session tokens
- **Internationalization** — English and Chinese UI

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
fileviewer /data --name Data /projects --name Projects

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
| `--name NAME` | directory name | Display name for the preceding path |
| `--host HOST` | `127.0.0.1` | Host to bind to |
| `--port PORT` | `8000` | Port to listen on |
| `--write` | off | Enable file write operations |
| `--user USER` | — | Username for authentication |
| `--password PASS` | — | Password for authentication |
| `--no-browser` | off | Do not open browser on startup |

## Tech Stack

**Backend:** Python 3.10+, FastAPI, Uvicorn, Polars, Pillow, httpx

**Frontend:** Vue 3, Vuetify 3, Pinia, CodeMirror 6, Vite

## Development

```bash
# Backend (runs on port 8001)
uvicorn fileviewer.server:app --reload --port 8001

# Frontend (runs on port 5173, proxies /api to backend)
cd frontend
npm install
npm run dev
```

Build for production:

```bash
cd frontend
npm run build   # outputs to fileviewer/static/
cd ..
pip install .
```

## Security Notes

- All paths are validated against the configured root directories — no directory traversal is possible.
- Write operations are disabled by default.
- Auth tokens are stored in HttpOnly, SameSite cookies.

## License

See [LICENSE](LICENSE).
