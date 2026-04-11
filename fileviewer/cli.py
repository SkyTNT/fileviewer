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
        nargs="*",
        default=["."],
        help="Root directory (or directories) to browse (default: current directory)",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser automatically")
    parser.add_argument("--write", action="store_true", help="Enable write mode (create, rename, delete, upload)")
    parser.add_argument("--name", action="append", dest="names", metavar="NAME",
                        help="Custom display name for a root directory (one per path, in order)")
    parser.add_argument("--user",     default=None, metavar="USERNAME", help="Require login with this username")
    parser.add_argument("--password", default=None, metavar="PASSWORD", help="Require login with this password")
    args = parser.parse_args()

    roots = [Path(p).resolve() for p in (args.path or ["."])]
    for root in roots:
        if not root.exists():
            print(f"Error: '{root}' does not exist", file=sys.stderr)
            sys.exit(1)
        if not root.is_dir():
            print(f"Error: '{root}' is not a directory", file=sys.stderr)
            sys.exit(1)

    names = list(args.names or [])
    if len(names) > len(roots):
        print("Error: more --name arguments than paths", file=sys.stderr)
        sys.exit(1)
    # Pad with empty strings for roots without a custom name
    names += [""] * (len(roots) - len(names))

    if bool(args.user) != bool(args.password):
        print("Error: --user and --password must be provided together", file=sys.stderr)
        sys.exit(1)

    parts = []
    for root, name in zip(roots, names):
        parts.append(f"{root}|{name}" if name else str(root))
    os.environ["FILE_VIEWER_ROOTS"] = ";".join(parts)

    if args.write:
        os.environ["FILE_VIEWER_WRITE"] = "1"
    if args.user:
        os.environ["FILE_VIEWER_USER"] = args.user
        os.environ["FILE_VIEWER_PASS"] = args.password

    url = f"http://{args.host}:{args.port}"
    print(f"File Viewer  →  {url}")
    if len(roots) == 1:
        label = names[0] or roots[0].name
        print(f"Browsing     →  {roots[0]}  ({label})")
    else:
        for i, (root, name) in enumerate(zip(roots, names)):
            label = name or root.name
            print(f"Root {i + 1}       →  {root}  ({label})")
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
