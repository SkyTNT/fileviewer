import argparse
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        prog="fileviewer",
        description="File browser with web UI",
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Root directory to browse (default: current directory)",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser automatically")
    parser.add_argument("--write", action="store_true", help="Enable write mode (create, rename, delete, upload)")
    parser.add_argument("--user",     default=None, metavar="USERNAME", help="Require login with this username")
    parser.add_argument("--password", default=None, metavar="PASSWORD", help="Require login with this password")
    args = parser.parse_args()

    root = Path(args.path).resolve()
    if not root.exists():
        print(f"Error: '{root}' does not exist", file=sys.stderr)
        sys.exit(1)
    if not root.is_dir():
        print(f"Error: '{root}' is not a directory", file=sys.stderr)
        sys.exit(1)

    if bool(args.user) != bool(args.password):
        print("Error: --user and --password must be provided together", file=sys.stderr)
        sys.exit(1)

    os.environ["FILE_VIEWER_ROOT"] = str(root)
    if args.write:
        os.environ["FILE_VIEWER_WRITE"] = "1"
    if args.user:
        os.environ["FILE_VIEWER_USER"] = args.user
        os.environ["FILE_VIEWER_PASS"] = args.password

    url = f"http://{args.host}:{args.port}"
    print(f"File Viewer  →  {url}")
    print(f"Browsing     →  {root}")
    if args.write:
        print(f"Write mode   →  enabled")
    if args.user:
        print(f"Login        →  enabled (user: {args.user})")

    if not args.no_browser:
        def _open():
            time.sleep(1.2)
            webbrowser.open(url)
        threading.Thread(target=_open, daemon=True).start()

    import uvicorn
    uvicorn.run("fileviewer.server:app", host=args.host, port=args.port)
