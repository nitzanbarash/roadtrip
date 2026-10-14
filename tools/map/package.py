#!/usr/bin/env python3
# Each half of the offline map -> an uncompressed zip (what phones and the page's save button accept)
# plus base64 text parts published next to its page.
import os, sys, zipfile, shutil, base64, json
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
RAW = 11 * 1024 * 1024 + 786432  # -> 16,427,691 chars of base64 per part, under the 16 MiB text limit
for half, src in (("east", sys.argv[1]), ("west", sys.argv[2])):
    pm = os.path.join(OUT, "roadtrip-map-%s.pmtiles" % half)
    shutil.copyfile(src, pm)
    zp = os.path.join(OUT, "roadtrip-map-%s.zip" % half)
    with zipfile.ZipFile(zp, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as z:
        z.write(pm, "roadtrip-map-%s.pmtiles" % half)
    md = os.path.join(OUT, "map_" + half)
    shutil.rmtree(md, ignore_errors=True)
    os.makedirs(md)
    sizes = []
    with open(zp, "rb") as f:
        i = 1
        while True:
            b = f.read(RAW)
            if not b:
                break
            open(os.path.join(md, "part%02d.txt" % i), "w").write(base64.b64encode(b).decode())
            sizes.append(len(b))
            i += 1
    json.dump(sizes, open(os.path.join(md, "sizes.json"), "w"))
    tot = sum(os.path.getsize(os.path.join(md, f)) for f in os.listdir(md))
    print(half, "zip", os.path.getsize(zp), "parts", len(sizes), "text total", tot)
