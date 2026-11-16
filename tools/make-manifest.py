#!/usr/bin/env python3
"""Keep worlds/index.json (the list of bundled worlds) in step with the worlds/ folder.

    python3 tools/make-manifest.py            # rewrite worlds/index.json
    python3 tools/make-manifest.py --check    # change nothing; exit 1 if it is stale or a world file is invalid

Run it after adding or removing a file in worlds/ by hand. (server.py does this for you when you
save or delete a world in the editor.) The --check form is what the GitHub Action runs on pull requests.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import server  # noqa: E402  (importing it does not start the server)


def main():
    check = "--check" in sys.argv[1:]
    good, bad = server.scan_worlds()
    path = os.path.join(server.WORLDS, server.MANIFEST)
    for fn, why in bad:
        print("INVALID  worlds/%s: %s" % (fn, why))
    try:
        with open(path, encoding="utf-8") as f:
            current = f.read()
    except OSError:
        current = None
    fresh = current == server.manifest_text(good)
    if check:
        if not fresh:
            print("STALE    worlds/%s does not match the folder. Run: python3 tools/make-manifest.py" % server.MANIFEST)
        if bad or not fresh:
            return 1
        print("OK: %d world(s) listed, manifest is up to date." % len(good))
        return 0
    server.write_manifest()
    print("%s %d world(s) in worlds/%s%s" % ("Up to date:" if fresh else "Wrote", len(good), server.MANIFEST,
                                              "  (%d invalid file(s) skipped)" % len(bad) if bad else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
