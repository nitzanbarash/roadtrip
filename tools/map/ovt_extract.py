#!/usr/bin/env python3
# Overture Maps -> OpenMapTiles-schema GeoJSONSeq for the trip corridor.
# Only row groups whose bbox touches a zone are fetched; features carry tippecanoe layer/zoom hints.
import os, sys, json, math, time, re
import concurrent.futures as cf
import numpy as np
import shapely
from shapely.geometry import shape, box, LineString, MultiLineString
from shapely.ops import substring
import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ovt_meta import meta, fs

OUT = "/tmp/claude-0/ovt/geo"
ZONES = None
_F = None


def init():
    global ZONES, _F
    raw = json.load(open("/tmp/claude-0/ovt/zones.json"))
    ZONES = {k: shape(v) for k, v in raw.items()}
    for g in ZONES.values():
        shapely.prepare(g)
    _F = fs()


class Sink:
    def __init__(self, theme):
        self.f = open(os.path.join(OUT, "%s.%d.geojsonl" % (theme, os.getpid())), "a")
        self.n = 0

    def put(self, layer, geom, props, minz=None, maxz=None, tol=None):
        if geom is None or geom.is_empty:
            return
        if tol and geom.geom_type != "Point":
            geom = shapely.simplify(geom, tol, preserve_topology=True)
            if geom.is_empty:
                return
        t = {"layer": layer}
        if minz is not None and minz > 0:
            t["minzoom"] = int(minz)
        if maxz is not None and maxz < 14:
            t["maxzoom"] = int(maxz)
        g = shapely.to_geojson(shapely.set_precision(geom, 1e-6, mode="pointwise"))
        self.f.write('{"type":"Feature","tippecanoe":%s,"properties":%s,"geometry":%s}\n' % (
            json.dumps(t, separators=(",", ":")), json.dumps(props, separators=(",", ":"), ensure_ascii=False), g))
        self.n += 1

    def close(self):
        self.f.close()


def km2(g):
    """rough area in km2 of a lon/lat geometry"""
    if g.is_empty:
        return 0
    lat = g.centroid.y
    return g.area * 111.32 * 111.32 * math.cos(math.radians(lat))


def area_minz(a, big=5):
    # a feature this big (km2) shows from this zoom
    if a > 2000: return big
    if a > 300: return 7
    if a > 50: return 9
    if a > 5: return 10
    if a > 0.5: return 12
    return 13


def polys_only(g):
    if g.is_empty:
        return g
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    ps = [x for x in getattr(g, "geoms", []) if x.geom_type in ("Polygon", "MultiPolygon")]
    return shapely.union_all(ps) if ps else shapely.Polygon()


def lines_only(g):
    if g.is_empty:
        return g
    if g.geom_type in ("LineString", "MultiLineString"):
        return g
    ls = [x for x in getattr(g, "geoms", []) if x.geom_type in ("LineString", "MultiLineString")]
    return shapely.union_all(ls) if ls else shapely.LineString()


def clip(g, zone):
    try:
        return shapely.intersection(g, zone)
    except Exception:  # an invalid input polygon: repair it and try once more
        try:
            return shapely.intersection(shapely.make_valid(g), zone)
        except Exception:
            return shapely.Polygon()


def emit_poly(sink, layer, g, props, minz):
    """up to z12: clipped to the mid zone; z13: clipped to the full-detail zone"""
    if minz <= 12:
        gm = polys_only(clip(g, ZONES["mid"]))
        if not gm.is_empty:
            sink.put(layer, gm.simplify(0.00005), props, minz, 12)
    if shapely.intersects(ZONES["full"], g):
        gf = polys_only(clip(g, ZONES["full"]))
        sink.put(layer, gf, props, max(13, minz), None, tol=0.00002)


def name_of(names):
    if not names:
        return None
    return names.get("primary")


def read_rg(path, rg, cols):
    return pq.ParquetFile(path, filesystem=_F).read_row_group(rg, columns=cols)


# ------------------------------------------------------------------ transportation
ROAD = {  # overture class -> (omt class, minzoom, zone)
    "motorway": ("motorway", 4, "mid"), "trunk": ("trunk", 5, "mid"), "primary": ("primary", 7, "mid"),
    "secondary": ("secondary", 9, "mid"), "tertiary": ("tertiary", 10, "mid"),
    "residential": ("minor", 12, "full"), "unclassified": ("minor", 12, "full"), "living_street": ("minor", 13, "full"),
    "unknown": ("minor", 13, "full"), "service": ("service", 13, "full"), "track": ("track", 13, "full"),
    "pedestrian": ("path", 13, "full"), "footway": ("path", 13, "full"), "path": ("path", 13, "full"),
    "steps": ("path", 13, "full"), "cycleway": ("path", 13, "full"), "bridleway": ("path", 13, "full"),
}
NET_RANK = {"us-interstate": 0, "us-highway": 1, "us-state": 2}


def route_ref(routes):
    best = None
    for r in routes or []:
        net, ref = r.get("network") or "", (r.get("ref") or "").strip()
        if not ref or not net.startswith("US:"):
            continue
        if net == "US:I":
            n = "us-interstate"
        elif net == "US:US":
            n = "us-highway"
        elif re.fullmatch(r"US:[A-Z]{2}", net):
            n = "us-state"
        else:
            continue
        ref = ref.replace("I ", "").replace("US ", "")
        if len(ref) > 6:
            continue
        if best is None or NET_RANK[n] < NET_RANK[best[0]]:
            best = (n, ref)
    return best


def brunnel_parts(geom, flags):
    """split a road at is_bridge / is_tunnel ranges -> [(geom, brunnel)]"""
    rng = []
    for f in flags or []:
        vals = f.get("values") or []
        b = "bridge" if "is_bridge" in vals else "tunnel" if "is_tunnel" in vals else None
        if not b:
            continue
        bt = f.get("between")
        if not bt:
            return [(geom, b)]
        rng.append((float(bt[0]), float(bt[1]), b))
    if not rng:
        return [(geom, None)]
    rng.sort()
    out, pos = [], 0.0
    for a, z, b in rng:
        if a > pos + 1e-6:
            out.append((substring(geom, pos, a, normalized=True), None))
        out.append((substring(geom, max(a, pos), z, normalized=True), b))
        pos = max(pos, z)
    if pos < 1 - 1e-6:
        out.append((substring(geom, pos, 1.0, normalized=True), None))
    return [(g, b) for g, b in out if g.geom_type == "LineString" and g.length > 0]


def oneway_of(acc):
    for a in acc or []:
        if a.get("access_type") != "denied":
            continue
        w = a.get("when") or {}
        if w.get("heading") and not (w.get("mode") or w.get("using") or w.get("during") or w.get("recognized") or w.get("vehicle")):
            return 1 if w["heading"] == "backward" else -1
    return None


def do_transport(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "subclass", "names", "routes", "road_flags", "access_restrictions", "road_surface", "geometry"])
    geoms = shapely.from_wkb(tb.column("geometry").to_numpy(zero_copy_only=False))
    keep_mid = shapely.intersects(ZONES["mid"], geoms)
    keep_full = shapely.intersects(ZONES["full"], geoms)
    keep_path = shapely.intersects(ZONES["path"], geoms)
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    scl = tb.column("subclass").to_pylist()
    idx = [i for i in range(len(sub)) if keep_mid[i]]
    if not idx:
        return 0
    names = tb.column("names").take(idx).to_pylist()
    routes = tb.column("routes").take(idx).to_pylist()
    flags = tb.column("road_flags").take(idx).to_pylist()
    acc = tb.column("access_restrictions").take(idx).to_pylist()
    surf = tb.column("road_surface").take(idx).to_pylist()
    sink = Sink("transport")
    for j, i in enumerate(idx):
        g = geoms[i]
        if g.geom_type != "LineString":
            continue
        if sub[i] == "rail":
            c = cls[i]
            if c in ("standard_gauge", "narrow_gauge"):
                oc, mz = "rail", 10
            elif c in ("light_rail", "subway", "tram", "monorail", "funicular"):
                oc, mz = "transit", 12
            else:
                continue
            if mz >= 12 and not keep_full[i]:
                continue
            for gg, b in brunnel_parts(g, flags[j]):
                p = {"class": oc}
                if b:
                    p["brunnel"] = b
                sink.put("transportation", gg, p, mz, tol=0.000012)
            continue
        if sub[i] != "road" or cls[i] not in ROAD:
            continue
        oc, mz, zone = ROAD[cls[i]]
        rs = surf[j] or []
        unpaved = bool(rs) and (rs[0].get("value") or "paved") != "paved"
        if zone == "full" and not keep_full[i]:
            # outside the detailed zone keep the dirt roads and rural roads (Google-like detail in nature), not city streets
            if oc == "path" or not (unpaved or cls[i] in ("track", "unclassified")):
                continue
            mz = 13
        sc = scl[i]
        if sc in ("sidewalk", "crosswalk", "driveway", "parking_aisle"):
            continue
        if oc == "path" and not keep_path[i]:
            continue
        ramp = sc == "link"
        if ramp:
            mz = max(mz, 10 if oc in ("motorway", "trunk") else 12)
            if not keep_full[i] and oc not in ("motorway", "trunk"):
                continue
        ow = oneway_of(acc[j])
        nm = name_of(names[j])
        rr = route_ref(routes[j])
        for gg, b in brunnel_parts(g, flags[j]):
            p = {"class": oc}
            if unpaved:
                p["surface"] = "unpaved"
            if ramp:
                p["ramp"] = 1
            if b:
                p["brunnel"] = b
            if ow:
                p["oneway"] = ow
            if sc == "alley":
                p["service"] = sc
            sink.put("transportation", gg, p, mz, tol=0.000012)
        if oc in ("service", "track", "path") and not rr:
            nm = None
        if nm or rr:
            p = {"class": oc}
            if nm:
                p["name"] = nm
            if rr:
                p["network"], p["ref"] = rr
                p["ref_length"] = len(rr[1])
            nmz = mz if rr else max(mz, 12 if oc in ("motorway", "trunk", "primary", "secondary", "tertiary") else 13)
            sink.put("transportation_name", g, p, nmz, tol=0.00005)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ water
WATER_POLY = {"ocean": ("ocean", 0), "lake": ("lake", None), "reservoir": ("lake", None), "pond": ("lake", 12),
              "water": ("lake", None), "river": ("river", None), "canal": ("river", 12), "human_made": (None, None)}
WATERWAY = {"river": ("river", 8), "canal": ("canal", 11), "stream": ("stream", 13), "tidal_channel": ("canal", 11)}


def do_water(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "names", "geometry"])
    geoms = shapely.from_wkb(tb.column("geometry").to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["mid"], geoms)
    idx = np.nonzero(keep)[0]
    if not len(idx):
        return 0
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    names = tb.column("names").take(idx).to_pylist()
    sink = Sink("water")
    for j, i in enumerate(idx):
        g, s, c, nm = geoms[i], sub[i], cls[i], name_of(names[j])
        gt = g.geom_type
        if gt in ("Polygon", "MultiPolygon"):
            if s == "human_made" and c != "salt_pond":
                continue
            oc, mz = WATER_POLY.get(s, ("lake", None))
            if oc is None:
                oc = "lake"
            a = km2(g)
            if mz is None:
                mz = area_minz(a, 4)
            emit_poly(sink, "water", g, {"class": oc}, mz)
            if nm and a > 0.2 and s != "ocean":
                pt = g.representative_point()
                if shapely.intersects(ZONES["mid"], pt):
                    sink.put("water_name", pt, {"class": "lake", "name": nm}, max(area_minz(a, 6) + 1, 8))
        elif gt in ("LineString", "MultiLineString"):
            wc = WATERWAY.get(c) or WATERWAY.get(s)
            if not wc:
                continue
            oc, mz = wc
            if mz >= 12 and not shapely.intersects(ZONES["full"], g):
                continue
            p = {"class": oc}
            if nm:
                p["name"] = nm
            sink.put("waterway", g, p, mz, tol=0.00003)
        elif gt == "Point" and nm and s == "physical" and c in ("bay", "strait", "sound", "gulf", "sea"):
            sink.put("water_name", g, {"class": c, "name": nm}, 8)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ land use / parks
LANDUSE = {("residential", "residential"): ("residential", 10), ("recreation", "pitch"): ("pitch", 13),
           ("recreation", "track"): ("track", 13), ("cemetery", "cemetery"): ("cemetery", 12),
           ("cemetery", "grave_yard"): ("cemetery", 13), ("medical", "hospital"): ("hospital", 12),
           ("education", "school"): ("school", 12), ("education", "college"): ("school", 12),
           ("education", "university"): ("school", 12), ("developed", "retail"): ("retail", 12),
           ("developed", "commercial"): ("commercial", 12), ("developed", "industrial"): ("industrial", 12)}
GRASSY = {("managed", "grass"), ("agriculture", "meadow"), ("golf", "golf_course"), ("golf", "fairway"),
          ("recreation", "recreation_ground"), ("golf", "green")}


def do_landuse(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "names", "geometry"])
    geoms = shapely.from_wkb(tb.column("geometry").to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["mid"], geoms)
    idx = np.nonzero(keep)[0]
    if not len(idx):
        return 0
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    names = tb.column("names").take(idx).to_pylist()
    sink = Sink("landuse")
    for j, i in enumerate(idx):
        g, s, c = geoms[i], sub[i], cls[i]
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        a = km2(g)
        nm = name_of(names[j])
        if s in ("protected", "park") or c in ("national_park", "state_park", "nature_reserve", "protected_area"):
            if c in ("dog_park",) or (s == "park" and a < 0.005):
                continue
            pc = c if c in ("national_park", "nature_reserve", "state_park") else "park"
            mz = area_minz(a, 4) if s == "protected" else max(area_minz(a, 8), 10)
            p = {"class": pc}
            emit_poly(sink, "park", g, p, mz)
            if nm and a > 0.02:
                pt = g.representative_point()
                if shapely.intersects(ZONES["mid"], pt):
                    sink.put("park_label", pt, {"class": pc, "name": nm, "area": round(a, 2)},
                             max(6, area_minz(a, 5) + (2 if s == "park" else 1)))
            continue
        if (s, c) in LANDUSE:
            oc, mz = LANDUSE[(s, c)]
            if oc == "residential":
                mz = max(mz, area_minz(a, 8))
            elif a < 0.01 and mz < 13:
                mz = 13
            emit_poly(sink, "landuse", g, {"class": oc}, mz)
        elif (s, c) in GRASSY:
            if a < 0.003:
                continue
            emit_poly(sink, "landcover", g, {"class": "grass", "subclass": c}, max(12, area_minz(a)))
    sink.close()
    return sink.n


# ------------------------------------------------------------------ natural land cover, peaks
LANDC = {("forest", "wood"): "wood", ("forest", "forest"): "wood", ("tree", "tree"): "wood",
         ("grass", "grass"): "grass", ("grass", "grassland"): "grass", ("wetland", "wetland"): "wetland",
         ("sand", "beach"): "sand", ("sand", "sand"): "sand", ("sand", "dune"): "sand",
         ("glacier", "glacier"): "ice", ("snow", "glacier"): "ice"}


def do_land(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "names", "elevation", "geometry"])
    geoms = shapely.from_wkb(tb.column("geometry").to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["mid"], geoms)
    idx = np.nonzero(keep)[0]
    if not len(idx):
        return 0
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    names = tb.column("names").take(idx).to_pylist()
    ele = tb.column("elevation").to_pylist()
    sink = Sink("land")
    for j, i in enumerate(idx):
        g, s, c = geoms[i], sub[i], cls[i]
        gt = g.geom_type
        if gt == "Point":
            nm = name_of(names[j])
            if s == "physical" and c in ("peak", "volcano") and nm:
                p = {"class": c, "name": nm}
                if ele[i]:
                    p["ele"] = int(ele[i])
                    p["ele_ft"] = int(round(ele[i] * 3.28084))
                sink.put("mountain_peak", g, p, 11 if ele[i] and ele[i] > 2500 else 12)
            continue
        if gt not in ("Polygon", "MultiPolygon"):
            continue
        k = LANDC.get((s, c))
        if not k:
            continue
        a = km2(g)
        if a < 0.002:
            continue
        mz = area_minz(a, 6)
        if k == "wetland":
            mz = max(mz, 10)
        emit_poly(sink, "landcover", g, {"class": k}, mz)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ infrastructure: runways, exits
def do_infra(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "names", "source_tags", "geometry"])
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    want = [i for i in range(len(sub)) if (sub[i] == "airport" and cls[i] in ("runway", "taxiway", "apron", "airport"))
            or (sub[i] == "transportation" and cls[i] == "motorway_junction")
            or (sub[i] == "pier" and cls[i] == "pier")]
    if not want:
        return 0
    geoms = shapely.from_wkb(tb.column("geometry").take(want).to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["full"], geoms)
    idx = [k for k in range(len(want)) if keep[k]]
    if not idx:
        return 0
    names = tb.column("names").take([want[k] for k in idx]).to_pylist()
    tags = tb.column("source_tags").take([want[k] for k in idx]).to_pylist()
    sink = Sink("infra")
    for j, k in enumerate(idx):
        i = want[k]
        g = geoms[k]
        c = cls[i]
        if sub[i] == "transportation":
            t = dict(tags[j] or [])
            ref = t.get("ref")
            if not ref:
                continue
            p = {"ref": ref[:8]}
            nm = name_of(names[j]) or t.get("exit_to")
            if nm:
                p["name"] = nm[:40]
            sink.put("exit", g, p, 13)
        elif sub[i] == "pier":
            if g.geom_type in ("LineString", "Polygon", "MultiPolygon"):
                sink.put("transportation", g, {"class": "pier"}, 13)
        else:
            if c in ("runway", "taxiway") and g.geom_type == "LineString":
                sink.put("aeroway", g, {"class": c}, 11 if c == "runway" else 13)
            elif g.geom_type in ("Polygon", "MultiPolygon"):
                sink.put("aeroway", g, {"class": "aerodrome" if c == "airport" else c}, 11)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ places -> poi
POI = {  # basic_category -> (class, rank)
    "gas_station": ("fuel", 2), "fuel_station": ("fuel", 2), "ev_charging_station": ("charging_station", 6),
    "hotel": ("lodging", 3), "motel": ("lodging", 3), "resort": ("lodging", 4), "inn": ("lodging", 5),
    "bed_and_breakfast": ("lodging", 8), "hostel": ("lodging", 8), "lodging": ("lodging", 5),
    "campground": ("campsite", 5), "rv_park": ("campsite", 6),
    "restaurant": ("restaurant", 9), "casual_eatery": ("restaurant", 10), "fast_food_restaurant": ("fast_food", 9),
    "cafe": ("cafe", 11), "coffee_shop": ("cafe", 11), "bakery": ("bakery", 15), "ice_cream_shop": ("ice_cream", 14),
    "dessert_shop": ("ice_cream", 16), "bar": ("bar", 14), "pub": ("bar", 14), "brewery": ("beer", 12),
    "winery": ("bar", 12), "food_truck": ("fast_food", 18),
    "grocery_store": ("grocery", 7), "supermarket": ("grocery", 6), "convenience_store": ("shop", 9),
    "food_and_beverage_store": ("grocery", 12), "liquor_store": ("alcohol_shop", 16),
    "pharmacy_and_drug_store": ("pharmacy", 8), "pharmacy": ("pharmacy", 8),
    "hospital": ("hospital", 3), "emergency_room": ("hospital", 3), "urgent_care_clinic": ("doctors", 8),
    "parking": ("parking", 12), "parking_lot": ("parking", 12), "parking_garage": ("parking_garage", 12),
    "museum": ("museum", 4), "art_museum": ("museum", 4), "history_museum": ("museum", 4), "science_museum": ("museum", 4),
    "art_gallery": ("art_gallery", 12), "zoo": ("zoo", 3), "aquarium": ("aquarium", 3),
    "amusement_park": ("amusement_park", 3), "theme_park": ("amusement_park", 3), "water_park": ("amusement_park", 4),
    "national_park": ("park", 3), "state_park": ("park", 4), "park": ("park", 8), "nature_reserve": ("park", 6),
    "botanical_garden": ("garden", 6), "garden": ("garden", 12),
    "historic_site": ("monument", 7), "landmark": ("attraction", 5), "monument": ("monument", 6),
    "memorial_site": ("monument", 8), "tourist_attraction": ("attraction", 4), "attraction": ("attraction", 5),
    "visitor_center": ("information", 4), "tourist_information_center": ("information", 4),
    "rest_area": ("highway_rest_area", 2), "rest_stop": ("highway_rest_area", 2), "truck_stop": ("fuel", 2),
    "car_rental": ("car_rental", 10), "car_rental_agency": ("car_rental", 10), "auto_repair": ("car_repair", 16),
    "shopping_mall": ("shop", 6), "shopping_center": ("shop", 8), "outlet_store": ("shop", 8),
    "department_store": ("shop", 12), "clothing_store": ("clothing_store", 18),
    "movie_theater": ("cinema", 12), "cinema": ("cinema", 12), "casino": ("casino", 5), "theater": ("theatre", 12),
    "performing_arts_venue": ("theatre", 12), "stadium_or_arena": ("stadium", 6), "stadium": ("stadium", 6),
    "bank_or_credit_union": ("bank", 17), "post_office": ("post", 15), "police_station": ("police", 15),
    "public_toilet": ("toilets", 10), "ski_resort": ("skiing", 3), "ski_area": ("skiing", 3),
    "hot_spring": ("hot_spring", 5), "beach": ("beach", 6), "scenic_viewpoint": ("viewpoint", 5),
    "viewpoint": ("viewpoint", 5), "waterfall": ("waterfall", 5), "lighthouse": ("lighthouse", 6),
    "hiking_trail": ("attraction", 9), "trailhead": ("attraction", 9), "golf_course": ("golf", 14),
    "library": ("library", 16),
}


def do_places(path, rg):
    tb = read_rg(path, rg, ["basic_category", "taxonomy", "confidence", "operating_status", "names", "brand", "geometry"])
    bc = tb.column("basic_category").to_pylist()
    tax = tb.column("taxonomy").to_pylist()
    conf = tb.column("confidence").to_pylist()
    st = tb.column("operating_status").to_pylist()
    want = []
    for i in range(len(bc)):
        k = bc[i] if bc[i] in POI else ((tax[i] or {}).get("primary") if (tax[i] or {}).get("primary") in POI else None)
        if not k or (st[i] and st[i] != "open"):
            continue
        want.append((i, k))
    if not want:
        return 0
    geoms = shapely.from_wkb(tb.column("geometry").take([w[0] for w in want]).to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["full"], geoms)
    sel = [(n, w) for n, w in enumerate(want) if keep[n]]
    if not sel:
        return 0
    names = tb.column("names").take([w[0] for _, w in sel]).to_pylist()
    brands = tb.column("brand").take([w[0] for _, w in sel]).to_pylist()
    sink = Sink("places")
    for j, (n, (i, k)) in enumerate(sel):
        nm = name_of(names[j])
        if not nm:
            continue
        br = brands[j] or {}
        branded = bool(br.get("wikidata") or name_of(br.get("names")))
        c = conf[i] or 0
        if c < (0.55 if branded else 0.72):
            continue
        oc, rank = POI[k]
        if branded:
            rank = max(1, rank - 2)
        if c < 0.8:
            rank += 3
        if rank > 14:
            continue
        sink.put("poi", geoms[n], {"class": oc, "subclass": k, "name": nm[:48], "rank": rank}, 13)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ divisions -> place labels
def do_divisions(path, rg):
    tb = read_rg(path, rg, ["subtype", "class", "country", "population", "names", "capital_of_divisions", "geometry"])
    sub = tb.column("subtype").to_pylist()
    ctry = tb.column("country").to_pylist()
    want = [i for i in range(len(sub)) if ctry[i] == "US" and sub[i] in ("locality", "neighborhood", "macrohood", "region")]
    if not want:
        return 0
    geoms = shapely.from_wkb(tb.column("geometry").take(want).to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["mid"], geoms)
    cls = tb.column("class").to_pylist()
    pop = tb.column("population").to_pylist()
    names = tb.column("names").take(want).to_pylist()
    cap = tb.column("capital_of_divisions").take(want).to_pylist()
    sink = Sink("div")
    for k, i in enumerate(want):
        g = geoms[k]
        if g.geom_type != "Point":
            continue
        nm = name_of(names[k])
        if not nm:
            continue
        s, c, pp = sub[i], cls[i], pop[i] or 0
        if s == "region":
            sink.put("place", g, {"class": "state", "name": nm, "rank": 2}, 4, 8)
            continue
        if not keep[k]:
            continue
        if s == "locality":
            if c == "city" or pp >= 100000:
                oc = "city"
            elif c == "town" or pp >= 5000:
                oc = "town"
            elif c == "village" or pp >= 500:
                oc = "village"
            else:
                oc = "hamlet"
        else:
            oc = "suburb" if s == "macrohood" else "neighbourhood"
        rank = 1 if pp > 1e6 else 2 if pp > 3e5 else 3 if pp > 1e5 else 4 if pp > 5e4 else 5 if pp > 2e4 else 6 if pp > 5e3 else 8 if pp > 1e3 else 10
        mz = {"city": 3 if pp > 1e6 else 5 if pp > 3e5 else 6 if pp > 1e5 else 7, "town": 8, "village": 10, "hamlet": 12,
              "suburb": 11, "neighbourhood": 13}[oc]
        p = {"class": oc, "name": nm, "rank": rank}
        if pp:
            p["population"] = int(pp)
        if cap[k]:
            p["capital"] = 4
        sink.put("place", g, p, mz)
    sink.close()
    return sink.n


# ------------------------------------------------------------------ buildings
def do_buildings(path, rg):
    tb = read_rg(path, rg, ["height", "min_height", "num_floors", "is_underground", "geometry"])
    geoms = shapely.from_wkb(tb.column("geometry").to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONES["bld"], geoms)
    idx = np.nonzero(keep)[0]
    if not len(idx):
        return 0
    h = tb.column("height").to_pylist()
    mh = tb.column("min_height").to_pylist()
    nf = tb.column("num_floors").to_pylist()
    ug = tb.column("is_underground").to_pylist()
    sink = Sink("bld")
    for i in idx:
        if ug[i]:
            continue
        g = geoms[i]
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        if g.area * 1.24e10 * math.cos(math.radians(g.centroid.y)) < 40:
            continue
        hh = h[i] or ((nf[i] or 0) * 3.4) or 5
        p = {"render_height": int(round(min(hh, 600)))}
        if mh[i]:
            p["render_min_height"] = int(round(mh[i]))
        sink.put("building", g, p, 13, tol=0.000008)
    sink.close()
    return sink.n


THEMES = {
    "transportation/type=segment": ("mid", do_transport),
    "base/type=water": ("mid", do_water),
    "base/type=land_use": ("mid", do_landuse),
    "base/type=land": ("mid", do_land),
    "base/type=infrastructure": ("full", do_infra),
    "places/type=place": ("full", do_places),
    "divisions/type=division": ("mid", do_divisions),
    "buildings/type=building": ("bld", do_buildings),
}


def task(args):
    theme, path, rg = args
    fn = THEMES[theme][1]
    for attempt in range(4):
        try:
            return fn(path, rg)
        except Exception as e:  # network hiccups: retry, then report
            if attempt == 3:
                sys.stderr.write("FAIL %s %s %s: %r\n" % (theme, path, rg, e))
                return 0
            time.sleep(2 * (attempt + 1))


def main():
    os.makedirs(OUT, exist_ok=True)
    init()
    themes = sys.argv[1:] or list(THEMES)
    for theme in themes:
        zk = THEMES[theme][0]
        m = meta(theme)
        jobs = []
        for p, rgs in m.items():
            for r, x0, y0, x1, y1, nr, sz in rgs:
                if theme.startswith("divisions") or shapely.intersects(ZONES[zk], box(x0, y0, x1, y1)):
                    jobs.append((theme, p, r))
        if os.environ.get("LIMIT"):
            jobs = jobs[:int(os.environ["LIMIT"])]
        t0 = time.time()
        tot = done = 0
        with cf.ProcessPoolExecutor(int(os.environ.get("NPROC", "6")), initializer=init) as ex:
            for n in ex.map(task, jobs, chunksize=1):
                tot += n
                done += 1
                if done % 50 == 0:
                    print("  %s %d/%d rg, %d features, %.0fs" % (theme, done, len(jobs), tot, time.time() - t0), flush=True)
        print("%s: %d row groups, %d features, %.0fs" % (theme, len(jobs), tot, time.time() - t0), flush=True)


if __name__ == "__main__":
    main()
