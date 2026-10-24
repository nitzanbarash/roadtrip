#!/usr/bin/env python3
"""Put edited app code into the built site (docs/) without the heavy build inputs.

The built page (docs/index.html) holds every source file inline. For each slot below, the
version of its files at REV (default: HEAD) is found inside the page and swapped for the
working-tree version. Placeholders such as __EVENTS__ keep whatever the build put there.
Then the service worker gets a new version, so phones pick up the change.

    python3 tools/map/patch_site.py            # from the repo root
"""
import hashlib, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = os.path.join(ROOT, "docs", "index.html")
SWF = os.path.join(ROOT, "docs", "sw.js")
REV = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
# each slot is what the build pasted into one placeholder of template3.html (same order, same joins)
SLOTS = [
    ("app.js + live.js", ["tools/map/app.js", "tools/map/live.js"], "\n"),
    ("markers.js + ext.js", ["tools/map/markers.js", "tools/map/ext.js"], ""),
    ("fin.js", ["tools/fin/fin.js"], ""),
    ("app.css + live.css", ["tools/map/app.css", "tools/map/live.css"], "\n"),
    ("ext.css", ["tools/map/ext.css"], ""),
    ("fin.css", ["tools/fin/fin.css"], ""),
    ("fin.html", ["tools/fin/fin.html"], ""),
]
PH = re.compile(r"(__[A-Z0-9_]+__)")


def at_rev(path):
    r = subprocess.run(["git", "-C", ROOT, "show", "%s:%s" % (REV, path)], capture_output=True)
    return r.stdout.decode("utf-8") if r.returncode == 0 else ""


def now(path):
    p = os.path.join(ROOT, path)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def join(texts, sep):
    return sep.join(t for t in texts if t) if sep else "".join(texts)


def locate(page, src):
    """where `src` (with placeholders) sits in the page, and what each placeholder became"""
    bits = PH.split(src)
    lits, names = bits[0::2], bits[1::2]
    start = page.find(lits[0])
    if start < 0 or page.find(lits[0], start + 1) >= 0:
        raise SystemExit("not found once in the page: %r…" % lits[0][:60])
    pos, vals = start + len(lits[0]), {}
    for name, lit in zip(names, lits[1:]):
        i = page.find(lit, pos) if lit else len(page)
        if i < 0:
            raise SystemExit("lost the trail after %s" % name)
        vals[name], pos = page[pos:i], i + len(lit)
    return start, pos, vals


def main():
    # always start from the committed page, so running this twice is safe
    page = at_rev("docs/index.html") or open(PAGE, encoding="utf-8").read()
    changed = 0
    for label, files, sep in SLOTS:
        old, new = join([at_rev(f) for f in files], sep), join([now(f) for f in files], sep)
        if old == new:
            continue
        a, b, vals = locate(page, old)
        for name in set(PH.findall(new)) - set(vals):
            raise SystemExit("%s: new placeholder %s has no value in the page" % (label, name))
        out = PH.sub(lambda m: vals[m.group(1)], new)
        page = page[:a] + out + page[b:]
        changed += 1
        print("patched", label)
    if not changed:
        print("nothing to patch")
        open(PAGE, "w", encoding="utf-8").write(page)
        return
    v = hashlib.sha1(re.sub(r'"v":"[0-9a-f]{10}"', "", page).encode()).hexdigest()[:10]
    page = re.sub(r'("sw":"sw\.js","v":")[0-9a-f]{10}"', lambda m: m.group(1) + v + '"', page)
    open(PAGE, "w", encoding="utf-8").write(page)
    sw = open(SWF, encoding="utf-8").read()
    sw = re.sub(r"var V='rt-[0-9a-f]{10}'", "var V='rt-%s'" % v, sw)
    open(SWF, "w", encoding="utf-8").write(sw)
    print("site version", v, round(len(page.encode()) / 1024), "KB")


if __name__ == "__main__":
    main()
