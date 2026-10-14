#!/usr/bin/env python3
# v2: new route (Miami -> Phoenix), precise coordinates, offline Leaflet map, KML export.
import json, re, os, sys, glob, math, subprocess
import numpy as np
from scipy.spatial import cKDTree
import build  # reuse detour_hours / slug / KINDS / GROUPS

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(HERE, *a)

# id, he, en, road, color, mile-from, mile-to, flags
SEGMENTS = [
    ("nyc",          "ניו יורק: תחילת הטיול",                 "New York City",                 "95", "New York", None, {"isnew": 1}),
    ("mid_atlantic", "פילדלפיה, בולטימור ו-וושינגטון",         "Philadelphia, Baltimore & Washington DC", "95", "New York", "Richmond", {"isnew": 1}),
    ("carolinas",    "וירג׳יניה והקרוליינות",                  "Virginia & the Carolinas",      "95", "Richmond", "Savannah", {"isnew": 1}),
    ("ga_fl_coast",  "סוואנה, ג׳קסונוויל וסנט אוגוסטין",       "Savannah, Jacksonville & St. Augustine", "95", "Savannah", "Daytona Beach", {"isnew": 1}),
    ("fl_east",      "חוף פלורידה המזרחי: דייטונה → מיאמי",    "Florida's East Coast",          "95", "Daytona Beach", "Miami", {"isnew": 1}),
    ("miami",         "מיאמי, אוורגליידס והקיז",              "Miami, Everglades & the Keys",  "1",  "Miami", None, {}),
    ("florida_north", "מרכז וצפון פלורידה: אורלנדו → גיינסוויל",         "Central & North Florida",       "75", "Miami", "Valdosta", {}),
    ("georgia",       "ג׳ורג׳יה: I-75 עד אטלנטה",              "Georgia on I-75",               "75", "Valdosta", "Chattanooga", {"isnew": 1}),
    ("tennessee",     "טנסי: צ׳טנוגה → נאשוויל",               "Chattanooga → Nashville",       "24", "Chattanooga", "Clarksville", {"isnew": 1}),
    ("ky_il",         "קנטקי, אילינוי וסנט לואיס",             "Kentucky, Illinois & St. Louis", "64", "Clarksville", "St. Louis", {"isnew": 1}),
    ("missouri",      "מיזורי: I-70 עד קנזס סיטי",            "Missouri on I-70",              "70", "St. Louis", "Kansas City", {"isnew": 1}),
    ("kansas",        "קנזס ומישורי קולורדו",                 "Kansas & the Plains",           "70", "Kansas City", "Denver", {"isnew": 1}),
    ("colorado",      "דנוור, לאבלנד (סקי) והרוקיז",          "Denver, Loveland & the Rockies", "70", "Denver", "Vail", {}),
    ("moab",          "מערב קולורדו ומואב",                    "Western Colorado & Moab",       "70", "Vail", "Green River", {}),
    ("utah_north",    "צפון יוטה → סולט לייק סיטי",           "Northern Utah",                 "6",  "Green River", "Salt Lake City", {"isnew": 1}),
    ("nevada80",      "נבדה: סולט פלטס → רינו",                "Nevada on I-80",                "80", "Salt Lake City", "Reno", {"isnew": 1}),
    ("tahoe_sac",     "לייק טאהו וסקרמנטו → סן פרנסיסקו",     "Tahoe & Sacramento",            "80", "Reno", "San Francisco", {"isnew": 1}),
    ("sf",            "סן פרנסיסקו ואזור המפרץ",               "San Francisco Bay Area",        "101", "San Francisco", None, {}),
    ("hwy1",          "כביש החוף 1: חלופה נופית ל-I-5",       "Pacific Coast Highway (alt.)",  "1",  "San Francisco", "Los Angeles",
     {"note": "המסלול של גוגל נוסע ב-I-5 (כ-6 שעות). כביש 1 לאורך החוף יפה בהרבה ומוסיף בערך 3 שעות."}),
    ("la",            "לוס אנג׳לס וסביבתה",                    "Greater Los Angeles",           "405", "Los Angeles", None, {}),
    ("la2lv",         "המדבר: לוס אנג׳לס → לאס וגאס",          "Mojave Desert",                 "15", "Los Angeles", "Las Vegas", {}),
    ("vegas",         "לאס וגאס והסביבה",                      "Las Vegas",                     "15", "Las Vegas", None, {}),
    ("utah",          "סטייה מווגאס: ציון, בריס ודרום יוטה",   "Detour: Southern Utah",         "9",  None, None,
     {"note": "לא על המסלול החדש. ציון נמצא בערך 2.5 שעות מלאס וגאס, ובריס בערך 4 שעות.", "recalc": 1}),
    ("phoenix",       "לאס וגאס → פיניקס (כביש 93)",          "Las Vegas → Phoenix",           "93", "Las Vegas", "Phoenix", {"isnew": 1}),
    ("arizona",       "סטייה מפיניקס: גרנד קניון, סדונה, פייג׳", "Detour: Northern Arizona",    "89", None, None,
     {"note": "לא על המסלול החדש. סדונה בערך שעתיים מפיניקס, והגרנד קניון בערך 3.5 שעות.", "recalc": 1}),
    ("nm_tx_north",   "ניו מקסיקו וצפון טקסס",                 "New Mexico & North Texas",      "25", None, None, {"old": 1}),
    ("dallas",        "דאלאס, פורט וורת׳ וטקסס",               "Dallas–Fort Worth",             "35", None, None, {"old": 1}),
    ("louisiana",     "לואיזיאנה וניו אורלינס",                "Louisiana & New Orleans",       "10", None, None, {"old": 1}),
    ("gulf",          "חוף המפרץ: אלבמה ופנהנדל פלורידה",      "The Gulf Coast",                "10", None, None, {"old": 1}),
]
COLORS = ["var(--neon)", "var(--park)", "var(--route)", "var(--mile)"]
OLD_NOTE = "רחוק מהמסלול החדש. נשאר כאן מהגרסה הקודמת."
SEG_IDS = [s[0] for s in SEGMENTS]
RECALC = {"utah", "arizona", "florida_north", "nm_tx_north", "dallas", "louisiana", "gulf"}

KINDS = dict(build.KINDS)
KINDS["ski"] = ("סקי", "action")
# cheap and free places to sleep (research pass 2)
KINDS.update({"free_camp": ("לינה חינם בטבע", "sleep"), "campground": ("קמפינג זול", "sleep"), "hostel": ("הוסטל", "sleep"),
              "motel": ("מוטל זול", "sleep"), "car_sleep": ("לישון ברכב", "sleep")})
GROUPS = build.GROUPS + [("sleep", "לינה זולה וחינם", "var(--sleepc)")]
GROUP_COLOR = {g[0]: g[2] for g in GROUPS}


def km(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def fmt_h(h):
    if h < 0.75:
        return "+%d דק׳" % max(10, int(round(h * 60 / 5.0) * 5))
    hh = int(h)
    mm = int(round((h - hh) * 60 / 10.0) * 10)
    if mm == 60:
        hh, mm = hh + 1, 0
    return "+%d:%02d שעות" % (hh, mm) if mm else ("+%d שעות" % hh if hh > 1 else "+שעה")


def norm_new(a):
    en = (a.get("name_en") or "").strip()
    if not en:
        return None
    sid = (a.get("segment_id") or "").strip()
    if sid not in SEG_IDS:
        return None
    kind = (a.get("kind") or "scenic").strip()
    if kind not in KINDS:
        kind = "scenic"
    try:
        wow = max(1, min(5, int(round(float(a.get("wow") or 3)))))
    except Exception:
        wow = 3
    det = (a.get("detour") or "על המסלול").strip()
    it = {
        "id": build.slug(en), "s": sid, "k": kind, "h": (a.get("name_he") or en).strip(), "e": en,
        "l": (a.get("city_state") or "").strip(), "d": det, "dh": build.detour_hours(det),
        "y": (a.get("why") or "").strip(), "p": (a.get("tip") or "").strip(), "c": (a.get("cost") or "").strip(),
        "t": (a.get("time_needed") or "").strip(), "se": (a.get("season") or "").strip(), "w": wow, "nw": 1,
    }
    ll = a.get("coords")
    if isinstance(ll, (list, tuple)) and len(ll) == 2:
        try:
            la, lo = float(ll[0]), float(ll[1])
            if 24 <= la <= 50 and -126 <= lo <= -66:
                it["g"], it["n"], it["cf"] = round(la, 4), round(lo, 4), "near"
        except Exception:
            pass
    return it


def main():
    old = json.load(open(P("items_old.json")))
    geo = {}
    for f in glob.glob(P("geoin", "out_*.json")):
        geo.update(json.load(open(f)))
    towns = json.load(open(P("coords.json")))
    for it in old:
        g = geo.get(it["id"])
        if g:
            it["g"], it["n"], it["cf"] = round(g[0], 4), round(g[1], 4), g[2] if len(g) > 2 else "near"
        else:
            t = towns.get(it["l"].lower().strip())
            if t:
                it["g"], it["n"], it["cf"] = t[0], t[1], "town"

    def key(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())
    seen = {key(it["e"]) for it in old}
    new, dup = [], 0
    for f in sorted(glob.glob(P("new", "*.json"))) + sorted(glob.glob(P("new2", "attr_*.json"))) + sorted(glob.glob(P("new2", "sleep_*.json"))):
        if os.path.basename(f) in ("example.json", "existing_names.json"):
            continue
        try:
            raw = json.load(open(f)).get("attractions", [])
        except Exception as e:
            print("bad file", f, e)
            continue
        for a in raw:
            it = norm_new(a)
            if not it:
                continue
            k = key(it["e"])
            if k in seen:
                dup += 1
                continue
            seen.add(k)
            if it.get("g") is None:
                t = towns.get(it["l"].lower().strip())
                if t:
                    it["g"], it["n"], it["cf"] = t[0], t[1], "town"
            new.append(it)
    items = old + new
    print("old", len(old), "new", len(new), "dups skipped", dup)

    # unique ids
    used = {}
    for it in items:
        b = it["id"] or "x"
        n = used.get(b, 0)
        used[b] = n + 1
        if n:
            it["id"] = b + "-" + str(n)

    # ---- distance to the new route / mile marker
    route = json.load(open(P(os.environ.get("ROUTE", "route.json"))))
    pch = json.load(open(P(os.environ.get("ROUTE_PCH", "route_pch.json"))))
    def tree_of(pts):
        return cKDTree(np.array([(p[1] * math.cos(math.radians(p[0])), p[0]) for p in pts]))
    rt, pt = tree_of(route["pts"]), tree_of(pch["pts"])
    mi = route["mi"]
    for it in items:
        if it.get("g") is None:
            continue
        q = (it["n"] * math.cos(math.radians(it["g"])), it["g"])
        tree, pts = (pt, pch["pts"]) if it["s"] == "hwy1" else (rt, route["pts"])
        _, j = tree.query(q)
        d = km((it["g"], it["n"]), pts[j])
        it["rk"] = round(d, 1)
        if it["s"] != "hwy1" and d < 60:
            it["mi"] = int(round(mi[j] / 5.0) * 5)
        if it["s"] in RECALC:
            h = 0.0 if d < 4 else d * 1.2 / 100 + 0.1
            it["dh"] = round(h, 2)
            it["d"] = "על המסלול" if h < 0.2 else ("≈ " + fmt_h(h) + " מהמסלול")

    # stacked identical coordinates -> tiny spiral so each stays tappable
    bucket = {}
    for it in items:
        if it.get("g") is None:
            continue
        k = (round(it["g"], 4), round(it["n"], 4))
        n = bucket.get(k, 0)
        bucket[k] = n + 1
        if n:
            spread = 0.004 if it.get("cf") == "town" else 0.0012
            ang = n * 2.39996
            r = spread * math.sqrt(n)
            it["g"] = round(it["g"] + r * math.sin(ang), 5)
            it["n"] = round(it["n"] + r * math.cos(ang) * 1.25, 5)

    order = {s: i for i, s in enumerate(SEG_IDS)}
    items.sort(key=lambda x: (order[x["s"]], -x["w"], x["dh"]))
    json.dump(items, open(P("items_all.json"), "w"), ensure_ascii=False)

    # ---- segment mile ranges from the route legs
    vm = {}
    for leg in route["legs"]:
        vm.setdefault(leg["from"], mi[leg["start"]])
    vm[route["vias"][-1]["name"]] = mi[-1]
    segs = []
    for i, (sid, he, en, road, a, b, fl) in enumerate(SEGMENTS):
        if a and b:
            mile = "%s–%s" % (format(int(round(vm[a], -1)), ","), format(int(round(vm[b], -1)), ","))
        elif a:
            mile = format(int(round(vm[a], -1)), ",")
        else:
            mile = ""
        s = {"id": sid, "he": he, "en": en, "road": road, "mile": mile, "color": COLORS[i % 4]}
        if a and b:
            i0 = next(l["start"] for l in route["legs"] if l["from"] == a)
            i1 = next((l["start"] for l in route["legs"] if l["from"] == b), len(route["pts"]) - 1)
            ps = pch["pts"] if sid == "hwy1" else route["pts"][i0:i1 + 1]
            s["bb"] = [[min(p[0] for p in ps), min(p[1] for p in ps)], [max(p[0] for p in ps), max(p[1] for p in ps)]]
        if fl.get("isnew"):
            s["isnew"] = 1
        if fl.get("old"):
            s["old"] = 1
            s["note"] = OLD_NOTE
        if fl.get("note"):
            s["note"] = fl["note"]
        segs.append(s)

    gcount = {g[0]: 0 for g in GROUPS}
    for it in items:
        gcount[KINDS[it["k"]][1]] += 1
    data = {
        "segments": segs,
        "kinds": {k: {"he": v[0], "g": v[1], "color": GROUP_COLOR[v[1]]} for k, v in KINDS.items()},
        "groups": [{"id": g[0], "he": g[1], "color": g[2], "count": gcount[g[0]]} for g in GROUPS],
        "items": [{k: v for k, v in it.items() if k != "rk"} for it in items],
    }
    json.dump(data, open(P("data.json"), "w"), ensure_ascii=False, separators=(",", ":"))

    # ---- base map (roads near route + near every attraction)
    subprocess.run([sys.executable, P("basemap.py"), "items_all.json"], check=True)
    base = open(P("basemap.json"), encoding="utf-8").read()
    lcss = open(P("lib", "package", "dist", "leaflet.css")).read()
    lcss = re.sub(r"background-image:\s*url\(images/[^)]*\);", "", lcss)
    ljs = open(P("lib", "package", "dist", "leaflet.js")).read()
    ljs = ljs.replace("//# sourceMappingURL=leaflet.js.map", "")
    tpl = open(P("template2.html"), encoding="utf-8").read()
    total_mi = format(int(round(mi[-1])), ",")
    html = (tpl.replace("__LEAFLET_CSS__", lcss)
               .replace("__LEAFLET_JS__", ljs)
               .replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
               .replace("__BASE__", base)
               .replace("__MILES__", total_mi)
               .replace("__TOTAL__", format(len(items), ","))
               .replace("__NEWCOUNT__", str(len(new)))
               .replace("__MUST__", str(sum(1 for i in items if i["w"] >= 5))))
    open(P("roadtrip.html"), "w", encoding="utf-8").write(html)

    write_kml(items, segs, route, pch, P("roadtrip.kml"), must_only=False)
    write_kml(items, segs, route, pch, P("roadtrip-must.kml"), must_only=True)

    per = {}
    for it in items:
        per[it["s"]] = per.get(it["s"], 0) + 1
    print("items:", len(items), "size:", round(len(html) / 1024), "KB")
    for s in segs:
        print("  %-14s %4d  %s" % (s["id"], per.get(s["id"], 0), s["mile"]))
    print("coords:", sum(1 for i in items if i.get("g") is not None), "town-level:", sum(1 for i in items if i.get("cf") == "town"))


# ---------------------------------------------------------------- KML
# Organic Maps / MAPS.ME read the "placemark-<colour>" style ids; Google Earth / My Maps read IconStyle
KML_STYLE = {  # group -> (style id, aabbggrr)
    "nature": ("placemark-green", "ff3f9a2c"), "water": ("placemark-blue", "ffd08a1e"),
    "action": ("placemark-red", "ff3c2fd9"), "culture": ("placemark-purple", "ffa04a7b"),
    "shop": ("placemark-orange", "ff1a8cf2"), "odd": ("placemark-pink", "ffa05ae0"), "sleep": ("placemark-brown", "ff9d3e7a"),
}


def x(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def write_kml(items, segs, route, pch, path, must_only):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
           "<name>%s</name>" % ("טיול ארה״ב — חובה בלבד" if must_only else "טיול ארה״ב — כל הנקודות")]
    for g, (sid, c) in KML_STYLE.items():
        out.append('<Style id="%s"><IconStyle><color>%s</color></IconStyle></Style>' % (sid, c))
    out.append('<Style id="route"><LineStyle><color>ffff8c1a</color><width>5</width></LineStyle></Style>')
    for s in segs:
        its = [i for i in items if i["s"] == s["id"] and i.get("g") is not None and (not must_only or i["w"] >= 5)]
        if not its:
            continue
        out.append("<Folder><name>%s</name>" % x(s["he"]))
        for it in its:
            q = re.sub(r"\s+", "+", (it["e"] + " " + it["l"]).strip())
            desc = "%s · %s\n%s\nטיפ: %s\n%s | %s | %s\n%s\nhttps://www.google.com/maps/search/?api=1&query=%s" % (
                it["e"], it["l"], it["y"], it["p"], it["c"], it["t"], it["se"], it["d"], q)
            out.append("<Placemark><name>%s%s</name><description>%s</description><styleUrl>#%s</styleUrl>"
                       "<Point><coordinates>%s,%s</coordinates></Point></Placemark>" % (
                           "★ " if it["w"] >= 5 else "", x(it["h"]), x(desc), KML_STYLE[KINDS[it["k"]][1]][0], it["n"], it["g"]))
        out.append("</Folder>")
    pts = route["pts"][::4] + [route["pts"][-1]]
    out.append('<Placemark><name>המסלול: ניו יורק → פיניקס</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><coordinates>%s</coordinates></LineString></Placemark>'
               % " ".join("%.4f,%.4f" % (p[1], p[0]) for p in pts))
    out.append("</Document></kml>")
    open(path, "w", encoding="utf-8").write("\n".join(out))


if __name__ == "__main__":
    main()
