#!/usr/bin/env python3
"""A picture for every event: the event's own Wikipedia image, else its venue's, else its town's.

Runs in GitHub Actions (needs the internet). Writes data/new2/event_images.json:
    {event_id: {"img": url, "from": "event"|"venue"|"city", "title": wikipedia title}}
Events that already carry an "img" keep it. patch_site.py puts the pictures into the app.
"""
import glob, json, math, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "new2", "event_images.json")
API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "roadtrip-app/1.0 (https://github.com/nitzanbarash/roadtrip; personal trip planner)"}
STOP = set("the a an of and at in on for to by with annual festival fair show live music night nights weekly market farmers".split())
STATES = {"Florida", "Georgia", "Tennessee", "Kentucky", "Illinois", "Missouri", "Kansas", "Colorado", "Utah", "Nevada", "California", "Arizona",
          "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland", "Virginia", "North Carolina", "South Carolina", "District of Columbia"}


def eid(e):   # same id as patch_site.events_json
    return re.sub(r"[^a-z0-9]+", "-", (e.get("name_en", "") + "-" + e["start"]).lower()).strip("-")[:60]


def get(params):
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return json.load(r)
        except Exception as ex:
            print("retry", i, ex, file=sys.stderr); time.sleep(2 + 3 * i)
    return {}


def alive(url):
    """does this picture address really give a picture?"""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA, method="HEAD"), timeout=15) as r:
            return r.status == 200 and r.headers.get("Content-Type", "").startswith("image/")
    except Exception:
        return False


def words(s):
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 1}


def km(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def near(p, at, lim):
    """True/False when the page has a place on the map, None when it doesn't"""
    c = (p.get("coordinates") or [None])[0]
    if not c or not at:
        return None
    return km((c["lat"], c["lon"]), at) <= lim


def pic(p):
    t = p.get("thumbnail", {}).get("source")
    return t if t and not re.search(r"(logo|flag|seal|map|icon|\.svg)", t, re.I) else None


def search(q, need, at):
    """best page for q with a picture, a title sharing enough words with `need`, and (if it has a place) near the event"""
    if not q.strip():
        return None
    j = get({"action": "query", "generator": "search", "gsrsearch": q, "gsrlimit": 5, "prop": "pageimages|coordinates", "piprop": "thumbnail", "pithumbsize": 800})
    pages = sorted(j.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
    nw = words(need)
    for p in pages:
        t = pic(p)
        if not t or not nw:
            continue
        tw = words(p["title"])
        if len(nw & tw) / len(nw) < .6 or len(tw - nw) > 3:
            continue
        ok = near(p, at, 60)
        if ok is False or (ok is None and (not nw <= tw or len(nw) < 2)):   # far away, or no place and not all of 2+ words
            continue
        return {"img": t, "title": p["title"]}
    return None


def exact(title, at):
    j = get({"action": "query", "titles": title, "redirects": 1, "prop": "pageimages|coordinates", "piprop": "thumbnail", "pithumbsize": 800})
    for p in j.get("query", {}).get("pages", []):
        t = pic(p)
        if t and near(p, at, 60) is not False:
            return {"img": t, "title": p["title"]}
    return None


def main():
    evs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "new2", "events_*.json"))):
        evs += [e for e in json.load(open(f, encoding="utf-8")).get("events", []) if e.get("start")]
    city_cache, out, n = {}, {}, {"event": 0, "venue": 0, "city": 0, "none": 0, "own": 0}
    for e in evs:
        k = eid(e)
        if e.get("img"):
            if alive(e["img"]):
                out[k] = {"img": e["img"], "from": "own", "title": ""}; n["own"] += 1; continue
            n["bad_own"] = n.get("bad_own", 0) + 1
        hit, src = None, None
        at = tuple(e["coords"]) if len(e.get("coords") or []) == 2 else None
        name, venue = e.get("name_en", ""), re.split(r",", e.get("venue", ""))[0].strip()
        if e.get("type") not in ("bar", "comedy"):
            hit = search(name, name, at); src = "event"
        if not hit and venue and len(words(venue)) >= 1:
            hit = search(venue + " " + e.get("city", ""), venue, at); src = "venue"
        if not hit:
            city, st = e.get("city", "").split(",")[0].strip(), e.get("state", "")
            key = city + "|" + st
            if key not in city_cache:
                city_cache[key] = exact(city + ", " + st, at) if st in STATES else None
                if not city_cache[key]:
                    city_cache[key] = exact(city, at)
            hit = city_cache[key]; src = "city"
        if hit:
            out[k] = dict(hit, **{"from": src}); n[src] += 1
        else:
            n["none"] += 1
        time.sleep(.15)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    print(len(evs), "events", n)


if __name__ == "__main__":
    main()
