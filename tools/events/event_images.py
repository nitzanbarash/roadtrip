#!/usr/bin/env python3
"""A picture for every event: the event's own Wikipedia image, else its venue's, else its town's.

Runs in GitHub Actions (needs the internet). Writes data/new2/event_images.json:
    {event_id: {"img": url, "from": "event"|"venue"|"city", "title": wikipedia title}}
Events that already carry an "img" keep it. patch_site.py puts the pictures into the app.
"""
import glob, json, os, re, sys, time, urllib.parse, urllib.request

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


def words(s):
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 1}


def search(q, need):
    """best page for q with a picture whose title shares enough words with `need`"""
    if not q.strip():
        return None
    j = get({"action": "query", "generator": "search", "gsrsearch": q, "gsrlimit": 5, "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 800})
    pages = sorted(j.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
    nw = words(need)
    for p in pages:
        t = p.get("thumbnail", {}).get("source")
        if not t or re.search(r"(logo|flag|seal|map|icon|\.svg)", t, re.I):
            continue
        tw = words(p["title"])
        if nw and len(nw & tw) / len(nw) >= .6 and len(tw - nw) <= 3:
            return {"img": t, "title": p["title"]}
    return None


def exact(title):
    j = get({"action": "query", "titles": title, "redirects": 1, "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 800})
    for p in j.get("query", {}).get("pages", []):
        t = p.get("thumbnail", {}).get("source")
        if t and not re.search(r"(logo|flag|seal|map|icon|\.svg)", t, re.I):
            return {"img": t, "title": p["title"]}
    return None


def main():
    have = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    evs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "new2", "events_*.json"))):
        evs += [e for e in json.load(open(f, encoding="utf-8")).get("events", []) if e.get("start")]
    city_cache, out, n = {}, {}, {"event": 0, "venue": 0, "city": 0, "none": 0, "own": 0}
    for e in evs:
        k = eid(e)
        if e.get("img"):
            n["own"] += 1; continue
        if k in have and have[k].get("img"):
            out[k] = have[k]; n[have[k]["from"]] += 1; continue
        hit, src = None, None
        name, venue = e.get("name_en", ""), re.split(r",", e.get("venue", ""))[0].strip()
        if e.get("type") not in ("bar", "comedy"):
            hit = search(name, name); src = "event"
        if not hit and venue and len(words(venue)) >= 1:
            hit = search(venue + " " + e.get("city", ""), venue); src = "venue"
        if not hit:
            city, st = e.get("city", "").split(",")[0].strip(), e.get("state", "")
            key = city + "|" + st
            if key not in city_cache:
                city_cache[key] = exact(city + ", " + st) if st in STATES else None
                if not city_cache[key]:
                    city_cache[key] = exact(city)
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
