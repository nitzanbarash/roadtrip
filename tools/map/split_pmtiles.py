#!/usr/bin/env python3
# Split one PMTiles archive into an east and a west half at a longitude; tiles that straddle the line go to both.
# Each half's header bounds come from its own z13 tiles, so the app knows which file covers where.
import sys, json, math, gzip
from pmtiles.reader import MmapSource, all_tiles
from pmtiles.writer import Writer
from pmtiles.tile import Compression, TileType, zxy_to_tileid

SRC, EAST, WEST, L = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
LABEL = {"east": "מזרח: ניו יורק → מיאמי", "west": "מערב: מיאמי → פיניקס"}


def lat_of(y, n):
    t = math.pi - 2 * math.pi * y / n
    return math.degrees(math.atan(math.sinh(t)))


with open(SRC, "rb") as f:
    src = MmapSource(f)
    from pmtiles.reader import Reader
    meta = Reader(src).metadata()
    halves = {"east": [], "west": []}
    bounds = {"east": [180, 90, -180, -90], "west": [180, 90, -180, -90]}
    for (z, x, y), data in all_tiles(src):
        n = 2 ** z
        w, e = x / n * 360 - 180, (x + 1) / n * 360 - 180
        tid = zxy_to_tileid(z, x, y)
        for half in ("east", "west"):
            if (half == "east" and e > L) or (half == "west" and w < L):
                halves[half].append((tid, data))
                if z == 13:
                    b = bounds[half]
                    b[0], b[1] = min(b[0], w), min(b[1], lat_of(y + 1, n))
                    b[2], b[3] = max(b[2], e), max(b[3], lat_of(y, n))
    for half, out in (("east", EAST), ("west", WEST)):
        tiles = sorted(halves[half])
        b = bounds[half]
        with open(out, "wb") as of:
            wr = Writer(of)
            for tid, data in tiles:
                wr.write_tile(tid, data)
            md = dict(meta)
            md["name"] = "roadtrip-" + half
            md["description"] = LABEL[half]
            wr.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
                         "min_lon_e7": int(b[0] * 1e7), "min_lat_e7": int(b[1] * 1e7),
                         "max_lon_e7": int(b[2] * 1e7), "max_lat_e7": int(b[3] * 1e7),
                         "center_zoom": 6, "center_lon_e7": int((b[0] + b[2]) / 2 * 1e7), "center_lat_e7": int((b[1] + b[3]) / 2 * 1e7)}, md)
        size = sum(len(d) for _, d in tiles)
        print("%s: %d tiles, %.0f MB, bounds %s" % (half, len(tiles), size / 1e6, [round(v, 2) for v in b]))
