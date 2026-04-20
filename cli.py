import argparse
import os
import sys
import threading
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(prog="fileviewerv2", description="File Viewer v2")
    parser.add_argument("path", nargs="*", default=["."], help="Root directories to serve")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--write", action="store_true", help="Enable write operations")
    parser.add_argument("--name", nargs="*", help="Display names for each root")
    parser.add_argument("--user", default="", help="Username for auth")
    parser.add_argument("--password", default="", help="Password for auth")
    args = parser.parse_args()

    roots = []
    for i, p in enumerate(args.path):
        abs_p = Path(p).resolve()
        if not abs_p.is_dir():
            print(f"Error: '{p}' is not a directory", file=sys.stderr)
            sys.exit(1)
        name = (args.name[i] if args.name and i < len(args.name) else abs_p.name) or str(abs_p)
        roots.append(f"{abs_p}|{name}")

    os.environ["FILE_VIEWER_ROOTS"] = ";".join(roots)
    if args.write:
        os.environ["FILE_VIEWER_WRITE"] = "1"
    if args.user:
        os.environ["FILE_VIEWER_USER"] = args.user
    if args.password:
        os.environ["FILE_VIEWER_PASS"] = args.password

    if not args.no_browser:
        url = f"http://localhost:{args.port}"
        def _open():
            time.sleep(1.2)
            import webbrowser
            webbrowser.open(url)
        threading.Thread(target=_open, daemon=True).start()

    import uvicorn
    uvicorn.run("server:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
