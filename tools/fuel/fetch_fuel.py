#!/usr/bin/env python3
"""Daily state fuel averages (AAA) -> docs/fuel.json for the app's fuel tab.

Keeps yesterday's numbers as `prev` so the app can show the change.
Run by .github/workflows/fuel.yml once a day.
"""
import json, os, re, sys, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else "docs/fuel.json"
URL = "https://gasprices.aaa.com/state-gas-price-averages/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0 Safari/537.36")
GRADES = ("regular", "mid", "premium", "diesel")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
                                               "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def parse(html):
    states = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        m = re.search(r"state=([A-Z]{2})[^>]*>\s*([^<]+?)\s*<", row)
        if not m:
            continue
        nums = [float(x) for x in re.findall(r"\$\s*([0-9]+\.[0-9]+)", row)][:4]
        if len(nums) < 4:
            continue
        states[m.group(1)] = dict(name=m.group(2).strip(), **dict(zip(GRADES, nums)))
    return states


def main():
    html = get(URL)
    states = parse(html)
    if len(states) < 40:
        print("parse failed: %d states, %d bytes" % (len(states), len(html)))
        print(html[:1500])
        sys.exit(1)
    m = re.search(r"Price as of\s*([0-9/]+)", html)
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT))
        except Exception:
            old = {}
    olds = old.get("states", {})
    for k, v in states.items():
        o = olds.get(k)
        if not o:
            continue
        # carry the previous day's prices; on a same-day re-run keep the older `prev`
        same = old.get("asof") == (m.group(1) if m else None)
        v["prev"] = o.get("prev") if same and o.get("prev") else {g: o.get(g) for g in GRADES}
    nat = {g: round(sum(s[g] for s in states.values()) / len(states), 3) for g in GRADES}
    out = {"source": "AAA", "url": URL, "asof": m.group(1) if m else None,
           "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "avg_states": nat, "states": states}
    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print("ok: %d states, as of %s, AZ regular %.3f" % (len(states), out["asof"], states.get("AZ", {}).get("regular", 0)))


if __name__ == "__main__":
    main()
