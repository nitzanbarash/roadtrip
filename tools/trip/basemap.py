#!/usr/bin/env python3
# Cuts an offline base map (roads with route numbers, land, lakes, parks, borders,
# town labels) out of Natural Earth, around the trip route and the attractions.
import json, math, os, sys
import shapefile
from shapely.geometry import LineString, Point, shape, box, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
NE = os.path.join(HERE, "ne")
BBOX = box(-127.5, 23.0, -64.0, 50.5)


# ---------------------------------------------------------------- encoding
def enc(coords, prec=1e4):
    """Google encoded polyline of (lon, lat) pairs -> str (lat first, like Google)."""
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


def rings(geom, tol):
    """Polygon/MultiPolygon -> list of polygons, each a list of encoded rings."""
    g = geom.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(getattr(g, "geoms", []))
    res = []
    for p in polys:
        if p.is_empty or not isinstance(p, Polygon) or p.area < tol * tol * 4:
            continue
        rr = [enc(list(p.exterior.coords))]
        for h in p.interiors:
            if Polygon(h).area > tol * tol * 20:
                rr.append(enc(list(h.coords)))
        res.append(rr)
    return res


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if hasattr(g, "geoms"):
        out = []
        for x in g.geoms:
            out.extend(lines_of(x))
        return out
    return []


def km_len(coords):
    t = 0
    for (x1, y1), (x2, y2) in zip(coords[:-1], coords[1:]):
        dx = (x2 - x1) * 111.3 * math.cos(math.radians((y1 + y2) / 2))
        dy = (y2 - y1) * 111.3
        t += math.hypot(dx, dy)
    return t


def pack_shields(shields):
    out = {}
    for lat, lon, t, num, z in shields:
        out.setdefault(t + "|" + num, []).extend([int(round(lat * 1000)), int(round(lon * 1000)), z])
    return out


def main():
    route = json.load(open(os.path.join(HERE, os.environ.get("ROUTE", "route.json"))))
    pch = json.load(open(os.path.join(HERE, os.environ.get("ROUTE_PCH", "route_pch.json"))))
    rpts = [(p[1], p[0]) for p in route["pts"]]
    rline = LineString(rpts).simplify(0.01)
    pline = LineString([(p[1], p[0]) for p in pch["pts"]]).simplify(0.01)
    items = json.load(open(os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else "items_all.json")))
    ipts = [Point(it["n"], it["g"]) for it in items if it.get("g") is not None]
    ipts_u = unary_union(ipts)

    both = unary_union([rline, pline])
    corr = {
        "wide": prep(both.buffer(4.0)),       # ~400 km: US highways
        "mid": prep(unary_union([both.buffer(2.3), ipts_u.buffer(0.9)])),   # state roads
        "near": prep(unary_union([both.buffer(0.45), ipts_u.buffer(0.3)])),  # local roads
    }

    # ------------------------------------------------------------ roads
    sf = shapefile.Reader(os.path.join(NE, "ne_10m_roads_north_america"))
    roads = {1: [], 2: [], 3: [], 4: []}
    shield_src = []  # (type, number, coords)
    for sr in sf.iterShapeRecords():
        r = sr.record.as_dict()
        if r["country"] != "United States":
            continue
        if r["type"] in ("Unpaved", "Ferry", "Trail") or r["class"] in ("Closed", "U/C"):
            continue
        fwy = r["type"] in ("Freeway", "Tollway")
        if r["class"] == "Interstate" or fwy:
            lv = 1
        elif r["class"] == "Federal":
            lv = 2
        elif r["class"] == "State":
            lv = 3
        else:
            lv = 4
        pts = sr.shape.points
        parts = list(sr.shape.parts) + [len(pts)]
        for i in range(len(parts) - 1):
            cs = pts[parts[i]:parts[i + 1]]
            if len(cs) < 2:
                continue
            ls = LineString(cs)
            if lv == 2 and not corr["wide"].intersects(ls):
                continue
            if lv == 3 and not corr["mid"].intersects(ls):
                continue
            if lv == 4 and not corr["near"].intersects(ls):
                continue
            tol = {1: 0.0007, 2: 0.0008, 3: 0.0009, 4: 0.0008}[lv]
            s = ls.simplify(tol)
            c = [(round(x, 4), round(y, 4)) for x, y in s.coords]
            roads[lv].append(c)
            num = (r["number"] or "").strip()
            if num and r["class"] in ("Interstate", "Federal", "State"):
                t = {"Interstate": "i", "Federal": "u", "State": "s"}[r["class"]]
                shield_src.append((t, num, c, lv))

    # chunk each level into 4-degree cells so the canvas can skip what's off screen
    road_out = []
    for lv, lines in roads.items():
        cells = {}
        for c in lines:
            mx = sum(p[0] for p in c) / len(c)
            my = sum(p[1] for p in c) / len(c)
            key = (int(math.floor(mx / 4)), int(math.floor(my / 4)))
            cells.setdefault(key, []).append(enc(c))
        for key, ls in cells.items():
            road_out.append({"lv": lv, "c": ls})
    print("roads:", {k: len(v) for k, v in roads.items()}, "points:",
          {k: sum(len(c) for c in v) for k, v in roads.items()})

    # ------------------------------------------------------------ shields
    MINZ = {"i": 5, "u": 7, "s": 9}
    MAXZ = {"i": 11, "u": 11, "s": 10}
    STEP = 10.0  # km between candidates
    cands = []
    for t, num, c, lv in shield_src:
        run, acc = 0.0, STEP / 2
        for (x1, y1), (x2, y2) in zip(c[:-1], c[1:]):
            d = km_len([(x1, y1), (x2, y2)])
            while acc <= run + d and d > 0:
                f = (acc - run) / d
                cands.append([t, num, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f])
                acc += STEP
            run += d
    shields = []
    kept = {}  # (t,num) -> list of (x,y)
    for z in range(5, 12):
        spacing = 640.0 / (2 ** (z - 5))  # km between same-number shields at this zoom
        cell = spacing / 111.0
        for cnd in cands:
            if cnd is None:
                continue
            t, num, x, y = cnd
            if z < MINZ[t] or z > MAXZ[t]:
                continue
            k = (t, num)
            grid = kept.setdefault(k, {})
            gx, gy = int(x / cell), int(y / cell)
            ok = True
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    for (px, py) in grid.get((gx + ddx, gy + ddy), ()):
                        if km_len([(x, y), (px, py)]) < spacing:
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    break
            if ok:
                grid.setdefault((gx, gy), []).append((x, y))
                shields.append([round(y, 4), round(x, 4), t, num, z])
        # rebuild grids at next spacing
        nk = {}
        for k in kept:
            pts = [(s[1], s[0]) for s in shields if (s[2], s[3]) == k]
            nk[k] = {}
        kept = {}
        nxt = 640.0 / (2 ** (z + 1 - 5)) / 111.0
        for s in shields:
            k = (s[2], s[3])
            kept.setdefault(k, {}).setdefault((int(s[1] / nxt), int(s[0] / nxt)), []).append((s[1], s[0]))
        # drop already-placed candidates
        placed = set((s[1], s[0]) for s in shields)
        cands = [c for c in cands if c is not None and (round(c[2], 4), round(c[3], 4)) not in placed]
    print("shields:", len(shields))

    # ------------------------------------------------------------ polygons
    land = json.load(open(os.path.join(NE, "ne_10m_land.geojson")))
    land_polys = []
    for f in land["features"]:
        g = shape(f["geometry"]).buffer(0).intersection(BBOX)
        if not g.is_empty:
            land_polys.extend(rings(g, 0.006))
    lakes = []
    for fn in ("ne_10m_lakes.geojson", "ne_10m_lakes_north_america.geojson"):
        for f in json.load(open(os.path.join(NE, fn)))["features"]:
            g = shape(f["geometry"]).buffer(0)
            if not g.intersects(BBOX):
                continue
            g = g.intersection(BBOX)
            lakes.extend(rings(g, 0.002))
    parks = []
    for f in json.load(open(os.path.join(NE, "ne_10m_parks_and_protected_lands_area.geojson")))["features"]:
        g = shape(f["geometry"]).buffer(0)
        if not g.intersects(BBOX):
            continue
        rp = g.representative_point()
        nm = f["properties"].get("unit_name") or f["properties"].get("name") or ""
        ty = f["properties"].get("unit_type") or ""
        parks.append({"n": nm, "t": ty, "at": [round(rp.y, 3), round(rp.x, 3)], "r": rings(g, 0.002)})
    states = []
    for f in json.load(open(os.path.join(NE, "ne_10m_admin_1_states_provinces_lines.geojson")))["features"]:
        if f["properties"].get("ADM0_A3") != "USA":
            continue
        for ln in lines_of(shape(f["geometry"]).intersection(BBOX)):
            states.append(enc([(round(x, 4), round(y, 4)) for x, y in ln.simplify(0.004).coords]))
    borders = []
    for f in json.load(open(os.path.join(NE, "ne_10m_admin_0_boundary_lines_land.geojson")))["features"]:
        p = f["properties"]
        if "USA" not in (p.get("ADM0_A3_L"), p.get("ADM0_A3_R")) and "United States" not in str(p.get("ADM0_LEFT")) + str(p.get("ADM0_RIGHT")):
            continue
        for ln in lines_of(shape(f["geometry"]).intersection(BBOX)):
            borders.append(enc([(round(x, 4), round(y, 4)) for x, y in ln.simplify(0.004).coords]))
    print("land", len(land_polys), "lakes", len(lakes), "parks", len(parks), "states", len(states), "borders", len(borders))

    # ------------------------------------------------------------ labels
    cities = []
    for f in json.load(open(os.path.join(NE, "ne_10m_populated_places_simple.geojson")))["features"]:
        p = f["properties"]
        if p.get("adm0name") != "United States of America":
            continue
        sr = p["scalerank"]
        z = 4 if sr <= 1 else 5 if sr <= 3 else 6 if sr <= 5 else 7 if sr <= 7 else 8
        cities.append([round(p["latitude"], 4), round(p["longitude"], 4), p["name"], z, int(p.get("pop_max") or 0)])
    have = set(c[2].lower() for c in cities)
    towns = json.load(open(os.path.join(HERE, "coords.json")))
    for k, v in towns.items():
        name = k.split(",")[0].strip().title()
        if name.lower() in have or len(name) < 3:
            continue
        have.add(name.lower())
        cities.append([round(v[0], 4), round(v[1], 4), name, 9, 0])
    cities.sort(key=lambda c: (c[3], -c[4]))

    # ------------------------------------------------------------ route
    def simp(pts, tol):
        return [(round(x, 4), round(y, 4)) for x, y in LineString([(p[1], p[0]) for p in pts]).simplify(tol).coords]
    mi = route["mi"]
    marks = []
    nxt = 100
    for (lat, lon), m in zip(route["pts"], mi):
        if m >= nxt:
            marks.append([round(lat, 4), round(lon, 4), nxt])
            nxt += 100
    stops = [[v["lat"], v["lon"], v.get("he", v["name"]), v["name"]] for v in route["vias"] if v.get("stop")]
    out = {
        "land": land_polys, "lakes": lakes, "parks": parks, "states": states, "borders": borders,
        "roads": road_out, "shields": pack_shields(shields), "cities": cities,
        "route": enc(simp(route["pts"], 0.0006)), "pch": enc(simp(pch["pts"], 0.0006)),
        "marks": marks, "stops": stops, "total": round(mi[-1]),
    }
    s = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    open(os.path.join(HERE, "basemap.json"), "w").write(s)
    print("basemap.json", round(len(s) / 1024), "KB")
    for k in out:
        print("  %-8s %6d KB" % (k, len(json.dumps(out[k], separators=(",", ":"), ensure_ascii=False)) // 1024))


if __name__ == "__main__":
    main()
