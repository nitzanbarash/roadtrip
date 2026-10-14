#!/usr/bin/env python3
# Row-group bounding boxes for every Overture file of a theme (footer reads only), cached as JSON.
import os, sys, json, concurrent.futures as cf
import pyarrow.fs as pafs, pyarrow.parquet as pq
REL = "overturemaps-us-west-2/release/2026-09-23.1/"
OUT = "/tmp/claude-0/ovt"


def fs():
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=os.environ.get("HTTPS_PROXY"),
                             tls_ca_file_path="/root/.ccr/ca-bundle.crt")


def meta(theme):
    path = os.path.join(OUT, "meta_%s.json" % theme.replace("/", "_").replace("=", ""))
    if os.path.exists(path):
        return json.load(open(path))
    f = fs()
    files = [i.path for i in f.get_file_info(pafs.FileSelector(REL + "theme=" + theme + "/")) if i.path.endswith(".parquet")]

    def one(p):
        md = pq.ParquetFile(p, filesystem=f).metadata
        names = [md.schema.column(i).path for i in range(md.num_columns)]
        ix = {k: names.index("bbox." + k) for k in ("xmin", "xmax", "ymin", "ymax")}
        rgs = []
        for r in range(md.num_row_groups):
            g = md.row_group(r)
            s = {k: g.column(i).statistics for k, i in ix.items()}
            rgs.append([r, s["xmin"].min, s["ymin"].min, s["xmax"].max, s["ymax"].max, g.num_rows, g.total_byte_size])
        return p, rgs
    res = {}
    with cf.ThreadPoolExecutor(24) as ex:
        for p, rgs in ex.map(one, files):
            res[p] = rgs
    json.dump(res, open(path, "w"))
    return res


if __name__ == "__main__":
    for t in sys.argv[1:]:
        m = meta(t)
        n = sum(len(v) for v in m.values())
        print(t, len(m), "files", n, "row groups")
