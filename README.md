# fileviewer

A web-based file browser and viewer with a modern UI. Browse local directories, view files of many formats, and optionally manage files — all from your browser.

All written by Claude

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
- **Images** — thumbnail grid, full-resolution pan/zoom viewer, side-by-side comparison slider; **image editor** with layer management, 15 drawing/selection tools (Move, Brush, Eraser, Crop, Fill, Gradient, Text, Shape, Lasso, Magic Wand, Blur, Smudge, and more), adjustments (Brightness/Contrast, Curves, Levels, Hue/Saturation, Color Balance, Exposure/Vibrance, Shadows/Highlights), WebGL-accelerated filters (Gaussian Blur, Sharpen, Noise, Vignette, Pixelate, Sepia, Emboss, Chromatic Aberration, and more), undo/redo history, export with format/quality control; **PSD** files open with full layer support
- **Tabular data** — Parquet, CSV, JSONL powered by Polars with SQL `WHERE` filter, sorting, resizable columns, dtype badges, schema browser, image column preview, and inline image editing
- **JSON** — collapsible tree viewer for `.json` files; switch to the tabular view (and back) via **Open With**
- **Archives** — browse zip, tar, tar.gz, tar.bz2, tar.xz, 7z, rar; random-access preview (zip/7z/rar); extract here or to subfolder; create archives with compression level and password (rar is extract-only, and needs `unrar`, `unar`, `bsdtar`, or `7z` on `PATH`)
- **MIDI** — playback with Web Audio synthesis, oscilloscope visualization, gain control, loop mode, and download
- **Video & audio** — Artplayer-based player with HTTP range streaming, playback speed, aspect ratio, picture-in-picture, and fullscreen; subtitle track selection from embedded streams or sibling `.srt`/`.ass`/`.vtt` files, with ASS rendering and adjustable timing offset; video thumbnails and audio cover-art thumbnails (video thumbnails need `ffmpeg` on `PATH`)
- **Markdown** — rendered preview with source toggle; local images open in the full image viewer/editor, remote `http(s)://` images render inline
- **Hex dump** — paged hex viewer for binary files
- **Open With** — open a file in any other viewer registered for its type, not just the default one

### File management (write mode)
- Create, rename, delete files and directories
- Upload via drag & drop onto the file area or file picker; large files upload as concurrent 64MB chunks and resume from where they left off if interrupted
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
- **Bookmarks** — save favorite directories for quick sidebar access (persisted in localStorage)
- **Authentication** — optional username/password login with HttpOnly session cookies
- **Internationalization** — English, Simplified Chinese, Traditional Chinese, Japanese
- **Theme** — light/dark mode and customizable accent color
- **Low-memory mode** — cache thumbnails and metadata on disk instead of in process memory, for large directories on constrained hosts

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

# Cache thumbnails/metadata on disk instead of in memory
fileviewer /path/to/dir --low-memory
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `paths` | `.` | One or more root directories to browse |
| `--name NAME [NAME ...]` | directory name | Display names for root directories (one per path, in order) |
| `--host HOST` | `127.0.0.1` | Host to bind to |
| `--port PORT` | `8001` | Port to listen on |
| `--write` | off | Enable file write operations |
| `--low-memory` | off | Cache thumbnails/metadata on disk (OS temp dir) instead of in memory |
| `--user USER` | — | Username for authentication |
| `--password PASS` | — | Password for authentication |
| `--no-browser` | off | Do not open browser on startup |

## Tech Stack

**Backend:** Python 3.10+, FastAPI, Uvicorn, Polars, Pillow, py7zr, rarfile, mutagen (optional: `ffmpeg` on `PATH` for video thumbnails and burning subtitle streams to `.vtt`)

**Frontend:** Vue 3, Vuetify 3, CodeMirror 6, Artplayer, Vite

## Development

```bash
# Backend (runs on port 8001)
pip install -e .
fileviewer . --port 8001 --write

# Frontend (runs on port 5173, proxies /api to backend)
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build      # outputs to fileviewer/static/
pip install .
```

## Security Notes

- All paths are validated against the configured root directories — no directory traversal is possible.
- Write operations are disabled by default.
- Auth tokens are stored in HttpOnly, SameSite cookies.

## License

See [LICENSE](LICENSE).