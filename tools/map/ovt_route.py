#!/usr/bin/env python3
# Re-route the trip on the Overture (OpenStreetMap) road network so the line sits exactly on the roads.
# Pass 1 (extract): main roads with their connectors inside the mid zone -> edges.pkl
# Pass 2 (route): Dijkstra between the same via points as route.py -> route_ovt.json / route_pch_ovt.json
import os, sys, json, math, pickle, time
import concurrent.futures as cf
import numpy as np
import shapely
from shapely.geometry import shape, box
from shapely.ops import substring
import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ovt_meta import meta, fs

W = "/tmp/claude-0/ovt"
TRIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trip")
SPEED = {"motorway": 108, "trunk": 92, "primary": 76, "secondary": 66, "tertiary": 56,
         "unclassified": 45}
LINK_SPEED = 55
ZONE = None
_F = None


def init():
    global ZONE, _F
    ZONE = shape(json.load(open(os.path.join(W, "zones.json")))["mid"])
    shapely.prepare(ZONE)
    _F = fs()


def oneway_of(acc):
    for a in acc or []:
        if a.get("access_type") != "denied":
            continue
        w = a.get("when") or {}
        if w.get("heading") and not (w.get("mode") or w.get("using") or w.get("during") or w.get("recognized") or w.get("vehicle")):
            return 1 if w["heading"] == "backward" else -1
    return 0


def hav_m(c):
    lon, lat = c[:, 0], c[:, 1]
    p = math.pi / 180
    dlat = (lat[1:] - lat[:-1]) * p
    dlon = (lon[1:] - lon[:-1]) * p
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1] * p) * np.cos(lat[1:] * p) * np.sin(dlon / 2) ** 2
    return 12742000 * np.arcsin(np.sqrt(a))


def work(args):
    path, rg = args
    for attempt in range(4):
        try:
            tb = pq.ParquetFile(path, filesystem=_F).read_row_group(rg, columns=["subtype", "class", "subclass", "connectors", "access_restrictions", "geometry"])
            break
        except Exception as e:
            if attempt == 3:
                sys.stderr.write("FAIL %s %s %r\n" % (path, rg, e))
                return []
            time.sleep(2 * (attempt + 1))
    sub = tb.column("subtype").to_pylist()
    cls = tb.column("class").to_pylist()
    want = [i for i in range(len(sub)) if sub[i] == "road" and cls[i] in SPEED]
    if not want:
        return []
    geoms = shapely.from_wkb(tb.column("geometry").take(want).to_numpy(zero_copy_only=False))
    keep = shapely.intersects(ZONE, geoms)
    idx = [k for k in range(len(want)) if keep[k]]
    if not idx:
        return []
    scl = tb.column("subclass").take([want[k] for k in idx]).to_pylist()
    con = tb.column("connectors").take([want[k] for k in idx]).to_pylist()
    acc = tb.column("access_restrictions").take([want[k] for k in idx]).to_pylist()
    out = []
    for j, k in enumerate(idx):
        g = geoms[k]
        if g.geom_type != "LineString":
            continue
        c = cls[want[k]]
        cons = sorted(con[j] or [], key=lambda x: x["at"])
        if len(cons) < 2:
            continue
        sp = LINK_SPEED if scl[j] == "link" else SPEED[c]
        ow = oneway_of(acc[j])
        for a, b in zip(cons[:-1], cons[1:]):
            if b["at"] - a["at"] <= 1e-9:
                continue
            part = g if (a["at"] <= 0 and b["at"] >= 1) else substring(g, a["at"], b["at"], normalized=True)
            if part.geom_type != "LineString":
                continue
            xy = np.asarray(part.coords, dtype=np.float64)[:, :2]
            m = float(hav_m(xy).sum()) if len(xy) > 1 else 0.0
            if m <= 0:
                continue
            out.append((a["connector_id"], b["connector_id"], m, m / (sp / 3.6), ow, xy.astype(np.float32)))
    return out


def extract():
    init()
    m = meta("transportation/type=segment")
    jobs = [(p, r) for p, rgs in m.items() for r, x0, y0, x1, y1, nr, sz in rgs if shapely.intersects(ZONE, box(x0, y0, x1, y1))]
    edges = []
    t0 = time.time()
    with cf.ProcessPoolExecutor(int(os.environ.get("NPROC", "4")), initializer=init) as ex:
        for n, res in enumerate(ex.map(work, jobs, chunksize=2)):
            edges.extend(res)
            if n % 100 == 0:
                print("  %d/%d rg, %d edges, %.0fs" % (n, len(jobs), len(edges), time.time() - t0), flush=True)
    pickle.dump(edges, open(os.path.join(W, "edges.pkl"), "wb"), protocol=4)
    print("edges:", len(edges), "%.0fs" % (time.time() - t0))


def route(vias_file, out_file):
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import dijkstra
    from scipy.spatial import cKDTree
    edges = pickle.load(open(os.path.join(W, "edges.pkl"), "rb"))
    nid = {}
    for e in edges:
        for c in (e[0], e[1]):
            if c not in nid:
                nid[c] = len(nid)
    n = len(nid)
    pos = np.zeros((n, 2))
    deg = np.zeros(n, int)
    U, V, Wt, EI = [], [], [], []
    for i, (a, b, m, t, ow, xy) in enumerate(edges):
        u, v = nid[a], nid[b]
        pos[u] = xy[0]
        pos[v] = xy[-1]
        deg[u] += 1
        deg[v] += 1
        if ow >= 0:
            U.append(u); V.append(v); Wt.append(t); EI.append(i)
        if ow <= 0:
            U.append(v); V.append(u); Wt.append(t); EI.append(~i)
    U, V, Wt, EI = map(np.array, (U, V, Wt, EI))
    order = np.lexsort((Wt, V, U))
    U, V, Wt, EI = U[order], V[order], Wt[order], EI[order]
    keep = np.ones(len(U), bool)
    keep[1:] = (U[1:] != U[:-1]) | (V[1:] != V[:-1])
    U, V, Wt, EI = U[keep], V[keep], Wt[keep], EI[keep]
    G = csr_matrix((Wt, (U, V)), shape=(n, n))
    emap = {(int(a), int(b)): int(e) for a, b, e in zip(U, V, EI)}
    print("graph", n, "nodes", len(U), "arcs")
    # snap only to nodes on the main network (degree >= 2) so a via doesn't land on a dead-end stub
    good = np.where(deg >= 2)[0]
    cosl = np.cos(np.radians(pos[good, 1]))
    tree = cKDTree(np.c_[pos[good, 0] * cosl, pos[good, 1]])

    def snap(lat, lon):
        d, i = tree.query((lon * math.cos(math.radians(lat)), lat), k=12)
        return [int(good[j]) for j in i]

    vias = json.load(open(os.path.join(TRIP, vias_file)))
    pts, legs, hours = [], [], 0.0
    for k in range(len(vias) - 1):
        a, b = vias[k], vias[k + 1]
        ss, ts = snap(a["lat"], a["lon"]), snap(b["lat"], b["lon"])
        best = None
        for s in ss[:4]:
            dist, pred = dijkstra(G, indices=s, return_predecessors=True, limit=40 * 3600)
            for t in ts:
                if np.isfinite(dist[t]) and (best is None or dist[t] < best[0]):
                    best = (dist[t], s, t, pred)
            if best:
                break
        if not best:
            print("NO PATH", a["name"], "->", b["name"])
            sys.exit(1)
        tt, s, t, pred = best
        hours += tt / 3600
        path = [t]
        while path[-1] != s:
            path.append(int(pred[path[-1]]))
        path.reverse()
        leg = []
        for x, y in zip(path[:-1], path[1:]):
            e = emap[(x, y)]
            xy = edges[e][5] if e >= 0 else edges[~e][5][::-1]
            seg = [(float(p[0]), float(p[1])) for p in xy]
            leg.extend(seg if not leg else seg[1:])
        legs.append({"from": a["name"], "to": b["name"], "start": max(0, len(pts) - (1 if pts else 0))})
        pts.extend(leg if not pts else leg[1:])
        km = float(hav_m(np.array(leg)).sum()) / 1000 if len(leg) > 1 else 0
        print("%-22s -> %-22s %6.0f mi %5.1f h" % (a["name"], b["name"], km / 1.609, tt / 3600))
    arr = np.array(pts)
    cum = np.concatenate([[0], np.cumsum(hav_m(arr))]) / 1609.34
    print("TOTAL %.0f miles, %.1f h, %d pts" % (cum[-1], hours, len(pts)))
    json.dump({"pts": [[round(p[1], 6), round(p[0], 6)] for p in pts], "mi": [round(float(c), 3) for c in cum],
               "legs": legs, "vias": vias, "hours": round(hours, 1)}, open(os.path.join(TRIP, out_file), "w"))


if __name__ == "__main__":
    if sys.argv[1] == "extract":
        extract()
    else:
        route(sys.argv[2], sys.argv[3])
