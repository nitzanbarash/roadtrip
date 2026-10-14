#!/usr/bin/env python3
# Zones around the trip that get map detail: the wider the zone, the fewer feature types it carries.
import json, os, math
import numpy as np
from shapely.geometry import LineString, Point, MultiPoint, mapping
from shapely.ops import unary_union, transform
from pyproj import Transformer

TRIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trip")
OUT = "/tmp/claude-0/ovt"
fwd = Transformer.from_crs(4326, 5070, always_xy=True).transform
inv = Transformer.from_crs(5070, 4326, always_xy=True).transform
OLD = {"nm_tx_north", "dallas", "louisiana", "gulf"}
METRO = {"New York", "Philadelphia", "Baltimore", "Washington", "Miami", "Orlando", "Atlanta", "Nashville", "St. Louis", "Kansas City", "Denver", "Salt Lake City",
         "Reno", "Sacramento", "San Francisco", "Los Angeles", "Las Vegas", "Phoenix"}


def P(g):
    return transform(fwd, g)


def shapely_valid(g):
    """a simplified union can touch itself; the extraction intersects with it, so it must be valid"""
    import shapely
    if g.is_valid:
        return g
    g = shapely.make_valid(g)
    if g.geom_type == "GeometryCollection":
        g = unary_union([x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")])
    return g.buffer(0)


def main():
    route = json.load(open(os.path.join(TRIP, os.environ.get("ROUTE", "route.json"))))
    pch = json.load(open(os.path.join(TRIP, os.environ.get("ROUTE_PCH", "route_pch.json"))))
    items = json.load(open(os.path.join(TRIP, "items_all.json")))
    rl = P(LineString([(p[1], p[0]) for p in route["pts"]])).simplify(50)
    pl = P(LineString([(p[1], p[0]) for p in pch["pts"]])).simplify(50)
    roads = unary_union([rl, pl])
    its = [it for it in items if it["s"] not in OLD and it.get("g") is not None]
    ipts = [P(Point(it["n"], it["g"])) for it in its]
    # straight connector from the route to each attraction: detours get their main roads
    links = []
    for p in ipts:
        d = roads.project(p)
        q = roads.interpolate(d)
        if q.distance(p) > 500:
            links.append(LineString([q, p]))
    links = unary_union(links)
    iu = unary_union(ipts)
    metros, towns = [], []
    for v in route["vias"]:
        (metros if v["name"] in METRO else towns).append(P(Point(v["lon"], v["lat"])))
    metros, towns = unary_union(metros), unary_union(towns)
    km = 1000.0
    zones = {
        # main roads, water, land cover, town labels; the offline map covers this area at every zoom
        "mid": unary_union([roads.buffer(15 * km), iu.buffer(8 * km), links.buffer(5 * km), metros.buffer(25 * km)]),
        # every street, paths, POIs, land use
        "full": unary_union([roads.buffer(2.5 * km), iu.buffer(2.2 * km), metros.buffer(13 * km), towns.buffer(4 * km)]),
        # building footprints
        "bld": unary_union([roads.buffer(0.4 * km), iu.buffer(0.8 * km), metros.buffer(5 * km), towns.buffer(1.5 * km)]),
        # footpaths and trails: around the attractions and in city centers
        "path": unary_union([iu.buffer(2.5 * km), metros.buffer(4 * km)]),
    }
    out = {}
    for k, g in zones.items():
        g = g.simplify(200)
        ll = transform(inv, g)
        ll = shapely_valid(ll)
        print("%-6s %9.0f km2  valid=%s" % (k, g.area / 1e6, ll.is_valid))
        out[k] = mapping(ll)
    json.dump(out, open(os.path.join(OUT, "zones.json"), "w"))


if __name__ == "__main__":
    main()
