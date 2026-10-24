#!/usr/bin/env python3
# v3: MapLibre navigator. One HTML file: detailed vector map (online OpenFreeMap or the offline PMTiles file),
# satellite, 3D terrain, GPS follow, plus the Natural Earth base that always works offline.
import json, os, base64, math
from shapely.geometry import shape, Point
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
TRIP = os.path.join(HERE, "..", "trip")
V = os.path.join(HERE, "vendor")
OUT = os.path.join(HERE, "out")
FIN = os.path.join(HERE, "..", "fin")
P = lambda *a: os.path.join(*a)

FONT_FILES = {
    "Noto Sans Regular": ["0-255", "1280-1535", "8192-8447"],
    "Noto Sans Medium": ["0-255", "1280-1535", "8192-8447"],
    "Noto Sans Italic": ["0-255", "8192-8447"],
}
LAND = "#f8f4f0"


def enc(coords, prec=1e5):
    out, plat, plon = [], 0, 0
    for lon, lat in coords:
        ilat, ilon = int(round(lat * prec)), int(round(lon * prec))
        for v in (ilat - plat, ilon - plon):
            v = ~(v << 1) if v < 0 else (v << 1)
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plon = ilat, ilon
    return "".join(out)


def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


POI_CLASSES = ["fuel", "charging_station", "highway_rest_area", "rest_area", "parking", "parking_garage", "car_rental", "car_repair", "car",
               "restaurant", "fast_food", "cafe", "bar", "beer", "ice_cream", "bakery", "grocery", "shop", "clothing_store", "alcohol_shop",
               "lodging", "campsite", "hospital", "pharmacy", "doctors", "park", "garden", "viewpoint", "waterfall", "hot_spring", "beach", "swimming",
               "museum", "art_gallery", "monument", "castle", "attraction", "theatre", "cinema", "library", "lighthouse", "amusement_park", "theme_park",
               "zoo", "aquarium", "casino", "golf", "stadium", "skiing", "bank", "atm", "post", "police", "information", "toilets"]
POI_KEY = ["fuel", "charging_station", "highway_rest_area", "rest_area", "lodging", "campsite", "hospital", "attraction", "museum", "viewpoint",
           "waterfall", "hot_spring", "information", "amusement_park", "theme_park", "zoo", "aquarium", "lighthouse", "beach", "grocery"]


def events():
    """events along the way, from the research files (trip/new2/events_*.json)"""
    import glob, re
    out, seen = [], set()
    for f in sorted(glob.glob(P(TRIP, "new2", "events_*.json"))):
        try:
            evs = json.load(open(f)).get("events", [])
        except Exception as e:
            print("skip", f, e)
            continue
        for e in evs:
            c = e.get("coords") or []
            if len(c) != 2 or not (24 <= c[0] <= 50 and -125 <= c[1] <= -66) or not e.get("start"):
                continue
            k = re.sub(r"[^a-z0-9]+", "-", (e.get("name_en", "") + "-" + e["start"]).lower()).strip("-")[:60]
            if k in seen:
                continue
            seen.add(k)
            out.append({"id": k, "name_en": e.get("name_en", ""), "name_he": e.get("name_he") or e.get("name_en", ""), "state": e.get("state", ""),
                        "city": e.get("city", ""), "venue": e.get("venue", ""), "start": e["start"], "end": e.get("end") or e["start"],
                        "confirmed": bool(e.get("confirmed")), "type": e.get("type", "other"), "why": e.get("why", ""), "tip": e.get("tip", ""),
                        "cost": e.get("cost", ""), "url": e.get("url", ""), "g": round(c[0], 4), "n": round(c[1], 4)})
            for f2 in ("weekly", "tags"):
                if e.get(f2):
                    out[-1][f2] = e[f2]
    print("events", len(out))
    return out


def style():
    s = json.load(open(P(V, "liberty.json")))
    s["sources"] = {"omt": {"type": "vector", "tiles": ["omt://{z}/{x}/{y}"], "minzoom": 0, "maxzoom": 14,
                            "attribution": "© OpenStreetMap · Overture Maps · OpenFreeMap"}}
    s["glyphs"] = "embed://fonts/{fontstack}/{range}.pbf"
    s["sprite"] = "embed://sprite/liberty"
    layers = []
    for l in s["layers"]:
        if l["id"] == "natural_earth":
            continue
        if l.get("source") == "openmaptiles":
            l["source"] = "omt"
        if l["id"] == "highway-shield-us-interstate":
            l.setdefault("paint", {})["text-color"] = "#ffffff"
        if l["id"] in ("highway-shield-us-interstate", "road_shield_us", "highway-shield-non-us"):
            l["layout"]["text-size"] = 10.5
            l["layout"]["text-font"] = ["Noto Sans Medium"]
            # one shield per stretch of road, not one per short segment
            l["layout"]["symbol-placement"] = "line"
            l["layout"]["symbol-spacing"] = ["interpolate", ["linear"], ["zoom"], 7, 260, 12, 380, 16, 520]
            l["layout"]["icon-padding"] = 8
            l["layout"]["symbol-sort-key"] = ["match", ["get", "network"], "us-interstate", 0, "us-highway", 1, 2]
        if l["id"] in ("highway-name-minor", "highway-name-major"):
            l["layout"]["text-size"] = ["interpolate", ["linear"], ["zoom"], 13, 12, 16, 14.5]
            l.setdefault("paint", {})["text-halo-color"] = "#ffffff"
            l["paint"]["text-halo-width"] = 1.4
            l["paint"]["text-color"] = "#4a4a4a"
        if l["id"] in ("poi_r1", "poi_r7", "poi_r20"):
            # our own round badges for the places people look for; anything else keeps the style's icon
            l["layout"]["icon-image"] = ["match", ["get", "class"], POI_CLASSES, ["concat", "p-", ["get", "class"]], l["layout"]["icon-image"]]
            l["layout"]["text-offset"] = [0, 1.05]
        if l["id"] == "poi_r20":
            # the important ones appear earlier, from zoom 12
            k = json.loads(json.dumps(l))
            k.update({"id": "poi_key", "minzoom": 12, "maxzoom": 15,
                      "filter": ["all", ["match", ["geometry-type"], ["MultiPoint", "Point"], True, False], ["match", ["get", "class"], POI_KEY, True, False]]})
            k["layout"]["text-optional"] = True
            k["layout"]["symbol-sort-key"] = ["match", ["get", "class"], ["fuel", "charging_station", "highway_rest_area"], 0, ["hospital"], 1, 2]
            layers.append(k)
        layers.append(l)
        if l["id"] == "road_service_track":
            # dirt roads: tracks dashed brown, and any road marked unpaved gets a dashed edge
            layers.append({"id": "road_track_dirt", "type": "line", "source": "omt", "source-layer": "transportation", "minzoom": 12,
                           "filter": ["all", ["match", ["get", "brunnel"], ["bridge", "tunnel"], False, True], ["==", ["get", "class"], "track"]],
                           "layout": {"line-join": "round"},
                           "paint": {"line-color": "#A47A4B", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 14, 1.8, 16, 3], "line-dasharray": [2.2, 1.2]}})
            layers.append({"id": "road_unpaved", "type": "line", "source": "omt", "source-layer": "transportation", "minzoom": 12,
                           "filter": ["all", ["==", ["get", "surface"], "unpaved"], ["match", ["get", "class"], ["minor", "service", "tertiary", "secondary"], True, False]],
                           "paint": {"line-color": "#B98E5A", "line-opacity": .8, "line-width": ["interpolate", ["linear"], ["zoom"], 12, .8, 16, 2.2], "line-dasharray": [1.4, 1.4]}})
        if l["id"] == "landcover_wood":
            layers.append({"id": "landcover_wood_pat", "type": "fill", "source": "omt", "source-layer": "landcover", "minzoom": 8,
                           "filter": ["==", ["get", "class"], "wood"],
                           "paint": {"fill-pattern": "pat-trees", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, .45, 12, .9]}})
        if l["id"] == "park":
            layers.append({"id": "park_pat", "type": "fill", "source": "omt", "source-layer": "park", "minzoom": 8,
                           "paint": {"fill-pattern": "pat-park", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, .5, 12, 1]}})
        if l["id"] == "background":
            layers.append({"id": "coverage", "type": "fill", "source": "omt", "source-layer": "coverage", "minzoom": 6,
                           "paint": {"fill-color": LAND}})
    extra = [
        {"id": "park_label", "type": "symbol", "source": "omt", "source-layer": "park_label", "minzoom": 7,
         "layout": {"text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-max-width": 8,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 13], "symbol-sort-key": ["-", 0, ["get", "area"]]},
         "paint": {"text-color": "#2F6B35", "text-halo-color": "#ffffff", "text-halo-width": 1.3}},
        {"id": "mountain_peak", "type": "symbol", "source": "omt", "source-layer": "mountain_peak", "minzoom": 11,
         "filter": ["any", [">=", ["zoom"], 14], [">", ["coalesce", ["get", "ele"], 0], ["step", ["zoom"], 3000, 12, 2200, 13, 1200]]],
         "layout": {"icon-image": "mountain_11", "text-field": ["case", ["has", "ele_ft"],
                    ["concat", ["coalesce", ["get", "name_en"], ["get", "name"]], "\n", ["to-string", ["get", "ele_ft"]], " ft"],
                    ["coalesce", ["get", "name_en"], ["get", "name"]]],
                    "text-font": ["Noto Sans Italic"], "text-size": 11, "text-anchor": "top", "text-offset": [0, .6], "text-optional": True},
         "paint": {"text-color": "#6b4e2e", "text-halo-color": "#ffffff", "text-halo-width": 1.2}},
        {"id": "exit", "type": "symbol", "source": "omt", "source-layer": "exit", "minzoom": 13,
         "layout": {"icon-image": "exitpill", "icon-text-fit": "both", "icon-text-fit-padding": [1, 4, 0, 4],
                    "text-field": ["concat", "EXIT ", ["get", "ref"]], "text-font": ["Noto Sans Medium"], "text-size": 10},
         "paint": {"text-color": "#ffffff"}},
    ]
    at = next(i for i, l in enumerate(layers) if l["id"] == "waterway_line_label")
    layers[at:at] = extra
    # a second copy of every map layer reads the offline file ("arch", max zoom 13, over-zoomed beyond);
    # the app shows one copy or the other
    both = []
    for l in layers:
        if l.get("source") != "omt":
            both.append(l)
            continue
        if l["id"] != "coverage":
            both.append(l)
        a = json.loads(json.dumps(l))
        a["id"] = l["id"] + "@a"
        a["source"] = "arch"
        a.setdefault("layout", {})["visibility"] = "none"
        both.append(a)
    s["layers"] = both
    s["sources"]["arch"] = {"type": "vector", "tiles": ["arch://{z}/{x}/{y}"], "minzoom": 0, "maxzoom": 13,
                            "attribution": "© OpenStreetMap · Overture Maps"}
    return s


def fonts():
    out = {}
    for f, ranges in FONT_FILES.items():
        for r in ranges:
            out[f + "/" + r] = base64.b64encode(open(P(V, "fonts", f, r + ".pbf"), "rb").read()).decode()
    return out


def sprite():
    return {"j1": json.load(open(P(V, "osm-liberty.json"))), "j2": json.load(open(P(V, "osm-liberty@2x.json"))),
            "p1": base64.b64encode(open(P(V, "osm-liberty.png"), "rb").read()).decode(),
            "p2": base64.b64encode(open(P(V, "osm-liberty@2x.png"), "rb").read()).decode()}


def zone_flags(base):
    zp = os.path.join("/tmp/claude-0/ovt", "zones.json")
    mid = prep(shape(json.load(open(zp))["mid"]))
    c = [1 if mid.contains(Point(x[1], x[0])) else 0 for x in base["cities"]]
    p = [1 if mid.contains(Point(pk["at"][1], pk["at"][0])) else 0 for pk in base["parks"]]
    s = []
    for k, a in base["shields"].items():
        for i in range(0, len(a), 3):
            s.append(1 if mid.contains(Point(a[i + 1] / 1000, a[i] / 1000)) else 0)
    return {"c": c, "p": p, "s": s}


def nav(route, pch):
    pts, mi = route["pts"], route["mi"]
    step = 3 if len(pts) < 30000 else 4
    keep = list(range(0, len(pts), step))
    if keep[-1] != len(pts) - 1:
        keep.append(len(pts) - 1)
    npts = [[round(pts[i][0], 5), round(pts[i][1], 5), round(mi[i], 2)] for i in keep]
    stops = []
    for leg in route["legs"][1:]:
        v = next(v for v in route["vias"] if v["name"] == leg["from"])
        stops.append([v.get("he") or v["name"], round(mi[leg["start"]], 1)])
    last = route["vias"][-1]
    stops.append([last.get("he") or last["name"], round(mi[-1], 1)])
    from shapely.geometry import LineString
    simp = lambda ps: list(LineString([(p[1], p[0]) for p in ps]).simplify(0.00002).coords)
    return {"pts": npts, "stops": stops, "total": round(mi[-1]), "r": enc(simp(pts)), "p": enc(simp(pch["pts"]))}


def reroute(data, base, route):
    """miles on the attractions, segment ranges and mile marks follow the (re-computed) route"""
    import sys
    import numpy as np
    from scipy.spatial import cKDTree
    sys.path.insert(0, TRIP)
    import build2
    pts = np.array(route["pts"])
    mi = np.array(route["mi"])
    tree = cKDTree(np.c_[pts[:, 1] * np.cos(np.radians(pts[:, 0])), pts[:, 0]])
    for it in data["items"]:
        if it.get("mi") is not None and it.get("g") is not None:
            _, i = tree.query((it["n"] * math.cos(math.radians(it["g"])), it["g"]))
            it["mi"] = int(round(mi[i]))
    vm = {}
    for leg in route["legs"]:
        vm.setdefault(leg["from"], mi[leg["start"]])
    vm[route["vias"][-1]["name"]] = mi[-1]
    by = {s["id"]: s for s in data["segments"]}
    for sid, he, en, road, a, b, fl in build2.SEGMENTS:
        s = by.get(sid)
        if not s:
            continue
        if a and b:
            s["mile"] = "%s–%s" % (format(int(round(vm[a], -1)), ","), format(int(round(vm[b], -1)), ","))
        elif a:
            s["mile"] = format(int(round(vm[a], -1)), ",")
    marks, nxt = [], 100
    for (lat, lon), m in zip(route["pts"], route["mi"]):
        if m >= nxt:
            marks.append([round(lat, 4), round(lon, 4), nxt])
            nxt += 100
    base["marks"] = marks
    base["total"] = round(mi[-1])


def gpx(route, pch, path):
    def trk(name, pts):
        return "<trk><name>%s</name><trkseg>%s</trkseg></trk>" % (name, "".join(
            '<trkpt lat="%.6f" lon="%.6f"/>' % (p[0], p[1]) for p in pts))
    wpt = "".join('<wpt lat="%.6f" lon="%.6f"><name>%s</name></wpt>' % (v["lat"], v["lon"], v.get("he") or v["name"])
                  for v in route["vias"] if v.get("stop"))
    open(path, "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="roadtrip" '
        'xmlns="http://www.topografix.com/GPX/1/1">%s%s%s</gpx>\n' % (wpt, trk("New York - Phoenix", route["pts"]), trk("Pacific Coast Highway (alt)", pch["pts"])))


SW = """// the app shell works offline once it was opened; the map parts are stored by the page itself (IndexedDB)
var V='rt-__V__', SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(V).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k!==V && k.indexOf('rt-')===0; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
function netFirst(e){ return fetch(e.request).then(function(res){ if(res && res.ok){ var c=res.clone(); caches.open(V).then(function(x){ x.put(e.request, c); }); } return res; }, function(){ return caches.match(e.request, {ignoreSearch:true}); }); }
function cacheFirst(e){ return caches.match(e.request, {ignoreSearch:true}).then(function(r){ return r || fetch(e.request).then(function(res){ if(res && res.ok){ var c=res.clone(); caches.open(V).then(function(x){ x.put(e.request, c); }); } return res; }); }); }
self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET') return;
  var u=new URL(e.request.url);
  if(u.origin===location.origin){ if(/\\/map\\//.test(u.pathname)) return; if(/fuel\\.json$/.test(u.pathname)){ e.respondWith(netFirst(e)); return; } e.respondWith(cacheFirst(e)); return; }
  if(/fonts\\.(googleapis|gstatic)\\.com$/.test(u.host)) e.respondWith(cacheFirst(e).catch(function(){ return new Response('', {status:504}); }));
});
"""
HEAD_EXTRA = """<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="הטיול">"""


def site(html, head, LABEL):
    """the app site (GitHub Pages): both map halves next to the page, service worker, install meta"""
    import hashlib
    S = P(HERE, "site")
    maps = []
    for half in ("east", "west"):
        d = P(S, "map", half)
        if not os.path.isdir(d):
            continue
        parts = sorted(f for f in os.listdir(d) if f.startswith("part"))
        sizes = json.load(open(P(d, "sizes.json")))
        maps.append({"parts": ["map/%s/%s" % (half, f) for f in parts], "sizes": sizes, "size": sum(sizes), "b64": False, "half": half, "label": LABEL[half]})
    if not maps:
        return
    page = html.replace("__MAPPARTS__", "null").replace("__HEAD_EXTRA__", HEAD_EXTRA)
    v = hashlib.sha1(page.encode()).hexdigest()[:10]
    page = page.replace("__HOST__", js({"maps": maps, "sw": "sw.js", "v": v}))
    open(P(S, "index.html"), "w", encoding="utf-8").write(head + page + "\n</html>\n")
    open(P(S, "sw.js"), "w", encoding="utf-8").write(SW.replace("__V__", v))
    print("site", v, round(len(page.encode()) / 1024), "KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    data = json.load(open(P(TRIP, "data.json")))
    base = json.load(open(P(TRIP, "basemap.json")))
    route = json.load(open(P(TRIP, os.environ.get("ROUTE", "route.json"))))
    pch = json.load(open(P(TRIP, os.environ.get("ROUTE_PCH", "route_pch.json"))))
    if os.environ.get("ROUTE"):
        reroute(data, base, route)
        gpx(route, pch, P(OUT, "roadtrip-route.gpx"))
        import build2
        build2.write_kml(data["items"], data["segments"], route, pch, P(OUT, "roadtrip-all.kml"), must_only=False)
        build2.write_kml(data["items"], data["segments"], route, pch, P(OUT, "roadtrip-must.kml"), must_only=True)
        print("route", round(route["mi"][-1]), "mi,", len(route["pts"]), "pts")
    mlcss = open(P(V, "ml5", "package", "dist", "maplibre-gl.css")).read()
    mljs = open(P(V, "ml5", "package", "dist", "maplibre-gl.js")).read().replace("//# sourceMappingURL=maplibre-gl.js.map", "")
    pmjs = open(P(V, "pm", "package", "dist", "pmtiles.js")).read()
    pmjs = pmjs.split("//# sourceMappingURL")[0]
    rtl = open(os.environ.get("RTLJS") or P(V, "rtl0.2.3", "package", "mapbox-gl-rtl-text.min.js")).read()
    for name, src in (("maplibre", mljs), ("pmtiles", pmjs)):
        if "</script" in src.lower():
            raise SystemExit(name + " contains </script")
    tpl = open(P(HERE, "template3.html"), encoding="utf-8").read()
    html = (tpl.replace("__MAPLIBRE_CSS__", mlcss)
               .replace("__MAPLIBRE_JS__", mljs)
               .replace("__PMTILES_JS__", pmjs)
               .replace("__DATA__", js(data))
               .replace("__BASE__", js(base))
               .replace("__BASEZ__", js(zone_flags(base)))
               .replace("__STYLE__", js(style()))
               .replace("__FONTS__", js(fonts()))
               .replace("__SPRITE__", js(sprite()))
               .replace("__NAV__", js(nav(route, pch)))
               .replace("__RTL__", js(rtl))
               .replace("__EXT_CSS__", open(P(HERE, "ext.css"), encoding="utf-8").read())
               .replace("__EXT_JS__", open(P(HERE, "markers.js"), encoding="utf-8").read() + open(P(HERE, "ext.js"), encoding="utf-8").read())
               .replace("__FIN_JS__", open(P(FIN, "fin.js"), encoding="utf-8").read())
               .replace("__APP_JS__", open(P(HERE, "app.js"), encoding="utf-8").read() + "\n" + open(P(HERE, "live.js"), encoding="utf-8").read())
               .replace("__FIN_HTML__", open(P(FIN, "fin.html"), encoding="utf-8").read())
               .replace("__FIN_CSS__", open(P(FIN, "fin.css"), encoding="utf-8").read())
               .replace("__APP_CSS__", open(P(HERE, "app.css"), encoding="utf-8").read() + "\n" + open(P(HERE, "live.css"), encoding="utf-8").read())
               .replace("__EVENTS__", js(events()))
               .replace("__ICONS__", open(P(HERE, "icons.json"), encoding="utf-8").read()))
    # each hosted page carries one half of the offline map as parts next to it; the saved file carries none
    LABEL = {"east": "מזרח: ניו יורק → מיאמי", "west": "מערב: מיאמי → פיניקס"}
    URLS = {"east": os.environ.get("EAST_URL", ""), "west": os.environ.get("WEST_URL", "")}
    for half in ("east", "west"):
        d = P(OUT, "map_" + half)
        if not os.path.isdir(d):
            continue
        parts = sorted(f for f in os.listdir(d) if f.startswith("part"))
        sizes = json.load(open(P(d, "sizes.json")))
        other = "west" if half == "east" else "east"
        hosted = {"parts": ["map/" + f for f in parts], "sizes": sizes, "size": sum(sizes), "b64": True,
                  "half": half, "label": LABEL[half]}
        if URLS[other]:
            hosted["other"] = {"url": URLS[other], "label": LABEL[other]}
        page = html.replace("__MAPPARTS__", js(hosted)).replace("__HOST__", "null").replace("__HEAD_EXTRA__", "")
        if half == "west":  # the artifact takes its name from <title>; the two pages must differ
            page = page.replace("<title>מסלול ניו יורק → פיניקס</title>", "<title>מסלול ניו יורק → פיניקס · קובץ מפה מערב</title>", 1)
        open(P(OUT, "artifact_%s.html" % half), "w", encoding="utf-8").write(page)
    head = '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
    open(P(OUT, "roadtrip-map.html"), "w", encoding="utf-8").write(head + html.replace("__MAPPARTS__", "null").replace("__HOST__", "null").replace("__HEAD_EXTRA__", "") + "\n</html>\n")
    site(html, head, LABEL)
    print("html", round(len(html.encode()) / 1024), "KB")


if __name__ == "__main__":
    main()
