#!/usr/bin/env python3
"""Tiny local server for Willy the Worm: serves the game and stores worlds as JSON files.

    python3 server.py [port]        # default port 8000, then open http://localhost:8000

A "world" is a named set of levels in one file: ./worlds/<id>.json. To share a world, send
the file; to install one, drop it in ./worlds (or use Import in the editor).
No dependencies, nothing leaves your machine (it only listens on 127.0.0.1).

API (used by the editor and the Worlds menu):
    GET    /api/worlds          -> list of all valid worlds
    PUT    /api/worlds/<id>     -> create/overwrite one world (JSON body)
    DELETE /api/worlds/<id>     -> remove it
"""
import json
import os
import re
import sys
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
WORLDS = os.path.join(ROOT, "worlds")
LEGACY = os.path.join(ROOT, "levels")          # single-level files from the first editor version
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
MANIFEST = "index.json"                         # list of bundled worlds, read by static hosts (GitHub Pages)
RESERVED = {"index"}                            # so no world can overwrite the manifest
CHARS = set(" =-H^*SBW<>")
W, H = 40, 22
MAX_BODY = 256 * 1024


def validate_level(d):
    """Return an error string, or None if d is a well-formed, playable level."""
    if not isinstance(d, dict):
        return "not an object"
    name = d.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 40:
        return "name must be 1-40 characters"
    theme = d.get("theme")
    if isinstance(theme, bool) or not isinstance(theme, int) or not 0 <= theme <= 7:
        return "theme must be 0-7"
    for key, lo, hi in (("rate", 0.8, 8), ("speed", 2, 9)):
        v = d.get(key)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            return "%s must be %s-%s" % (key, lo, hi)
    m = d.get("map")
    if not isinstance(m, list) or len(m) != H:
        return "map must have %d rows" % H
    for row in m:
        if not isinstance(row, str) or len(row) != W:
            return "every map row must be %d characters" % W
        if not set(row) <= CHARS:
            return "unknown map character"
    flat = "".join(m)
    if flat.count("W") != 1:
        return "needs exactly one worm start"
    if flat.count("B") != 1:
        return "needs exactly one bell"
    return None


def validate_world(w):
    if not isinstance(w, dict):
        return "not an object"
    name = w.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 40:
        return "world name must be 1-40 characters"
    author = w.get("author", "")
    if not isinstance(author, str) or len(author) > 30:
        return "author must be at most 30 characters"
    desc = w.get("description", "")
    if not isinstance(desc, str) or len(desc) > 200:
        return "description must be at most 200 characters"
    levels = w.get("levels")
    if not isinstance(levels, list) or not 1 <= len(levels) <= 30:
        return "a world needs 1-30 levels"
    for i, lv in enumerate(levels):
        err = validate_level(lv)
        if err:
            return "level %d: %s" % (i + 1, err)
    return None


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json_atomic(directory, filename, obj):
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=1)
            f.write("\n")
        os.replace(tmp, os.path.join(directory, filename))     # atomic
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def valid_id(s):
    return bool(ID_RE.match(s)) and s not in RESERVED


def scan_worlds():
    """-> (sorted ids of valid worlds, [(filename, problem), ...])"""
    good, bad = [], []
    if os.path.isdir(WORLDS):
        for fn in sorted(os.listdir(WORLDS)):
            if not fn.endswith(".json") or fn == MANIFEST:
                continue
            wid = fn[:-5]
            if not valid_id(wid):
                bad.append((fn, "file name must be lowercase letters, digits, - or _ (and not 'index')"))
                continue
            try:
                d = read_json(os.path.join(WORLDS, fn))
            except (OSError, ValueError):
                bad.append((fn, "not valid JSON"))
                continue
            err = validate_world(d)
            if err:
                bad.append((fn, err))
            else:
                good.append(wid)
    return good, bad


def manifest_text(ids):
    return json.dumps({"worlds": ids}, indent=1) + "\n"


def write_manifest():
    """Keep worlds/index.json in step with the folder, so a static copy of the site can list the worlds."""
    good, _ = scan_worlds()
    os.makedirs(WORLDS, exist_ok=True)
    path = os.path.join(WORLDS, MANIFEST)
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == manifest_text(good):
                return
    except OSError:
        pass
    write_json_atomic(WORLDS, MANIFEST, {"worlds": good})


def migrate_legacy():
    """One time: single-level files in ./levels become a world called "My levels". Originals are left alone."""
    marker = os.path.join(WORLDS, ".legacy-migrated")
    if os.path.exists(marker) or not os.path.isdir(LEGACY):
        return
    found = []
    for fn in sorted(os.listdir(LEGACY)):
        if fn.endswith(".json") and ID_RE.match(fn[:-5]):
            try:
                d = read_json(os.path.join(LEGACY, fn))
            except (OSError, ValueError):
                continue
            if validate_level(d) is None:
                found.append({k: d[k] for k in ("name", "theme", "rate", "speed", "map")})
    os.makedirs(WORLDS, exist_ok=True)
    if found and not os.path.exists(os.path.join(WORLDS, "my-levels.json")):
        write_json_atomic(WORLDS, "my-levels.json", {
            "id": "my-levels", "name": "My levels", "author": "",
            "description": "Levels saved before worlds existed.", "levels": found[:30]})
        print("Migrated %d old level(s) into the world 'My levels'." % len(found[:30]))
    open(marker, "w").close()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---- helpers
    def end_headers(self):
        if not getattr(self, "_has_cache_header", False):
            self.send_header("Cache-Control", "no-cache")      # always re-check, so edits show up
        self._has_cache_header = False
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._has_cache_header = True
        self.end_headers()
        self.wfile.write(body)

    def local_only(self):
        """Refuse DNS-rebinding and cross-site writes: Host and Origin must be this server."""
        host = self.headers.get("Host", "")
        if host.rsplit(":", 1)[0] not in ("localhost", "127.0.0.1", "[::1]"):
            return False
        origin = self.headers.get("Origin")
        return origin is None or urlparse(origin).netloc == host

    def world_id(self):
        parts = urlparse(self.path).path.split("/")          # ['', 'api', 'worlds', '<id>']
        return unquote(parts[3]) if len(parts) == 4 else None

    def is_api(self):
        return urlparse(self.path).path.startswith("/api/")

    # ---- routes
    def do_GET(self):
        if not self.is_api():
            return super().do_GET()
        if not self.local_only():
            return self.send_json(403, {"error": "forbidden"})
        if urlparse(self.path).path != "/api/worlds":
            return self.send_json(404, {"error": "not found"})
        os.makedirs(WORLDS, exist_ok=True)
        out = []
        for fn in sorted(os.listdir(WORLDS)):
            if not fn.endswith(".json") or not valid_id(fn[:-5]):
                continue
            path = os.path.join(WORLDS, fn)
            try:
                d = read_json(path)
            except (OSError, ValueError):
                continue
            if validate_world(d) is None:
                d["id"] = fn[:-5]
                d.setdefault("author", "")
                d.setdefault("description", "")
                d["updated"] = int(os.path.getmtime(path) * 1000)
                out.append(d)
        out.sort(key=lambda d: -d["updated"])
        self.send_json(200, out)

    def do_PUT(self):
        wid = self.world_id()
        if not self.is_api() or wid is None:
            return self.send_json(404, {"error": "not found"})
        if not self.local_only():
            return self.send_json(403, {"error": "forbidden"})
        if not valid_id(wid):
            return self.send_json(400, {"error": "bad world id"})
        if "application/json" not in self.headers.get("Content-Type", ""):
            return self.send_json(415, {"error": "send application/json"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = -1
        if not 0 < n <= MAX_BODY:
            return self.send_json(413, {"error": "body too large or missing"})
        try:
            d = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            return self.send_json(400, {"error": "invalid JSON"})
        err = validate_world(d)
        if err:
            return self.send_json(400, {"error": err})
        clean = {
            "id": wid,
            "name": d["name"].strip(),
            "author": d.get("author", "").strip(),
            "description": d.get("description", "").strip(),
            "levels": [{k: lv[k] for k in ("name", "theme", "rate", "speed", "map")} for lv in d["levels"]],
        }
        write_json_atomic(WORLDS, wid + ".json", clean)
        write_manifest()
        clean["updated"] = int(time.time() * 1000)
        self.send_json(200, clean)

    def do_DELETE(self):
        wid = self.world_id()
        if not self.is_api() or wid is None:
            return self.send_json(404, {"error": "not found"})
        if not self.local_only():
            return self.send_json(403, {"error": "forbidden"})
        if not valid_id(wid):
            return self.send_json(400, {"error": "bad world id"})
        try:
            os.unlink(os.path.join(WORLDS, wid + ".json"))
        except FileNotFoundError:
            return self.send_json(404, {"error": "no such world"})
        write_manifest()
        self.send_json(200, {"deleted": wid})

    def log_message(self, fmt, *args):
        if self.is_api() or "favicon" not in self.path:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.makedirs(WORLDS, exist_ok=True)
    migrate_legacy()
    write_manifest()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Willy the Worm  ->  http://localhost:%d" % port)
    print("Level editor    ->  http://localhost:%d/editor.html" % port)
    print("Worlds are saved in:", WORLDS)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
