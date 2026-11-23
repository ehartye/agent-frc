"""Serve a project's published review over HTTP on this computer. Run it from the project root, from the plugin."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1", help="Set the host LAN address to share the review")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--site", type=Path, default=Path("docs/preliminary-design"),
                        help="The published folder to serve (default: docs/preliminary-design under the current folder)")
    args = parser.parse_args()
    public = args.site.resolve()
    if not (public / "index.html").is_file():
        parser.error("No index.html in " + args.site.as_posix() + ". Run this from the project root, or name the published folder with --site")
    handler = partial(SimpleHTTPRequestHandler, directory=str(public))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Review at http://{args.bind}:{server.server_port}/ (Ctrl+C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
