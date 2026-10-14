#!/usr/bin/env python3
# builds the Claude page (index.html) from the shared finance module
import os
H = os.path.dirname(os.path.abspath(__file__))
r = lambda n: open(os.path.join(H, n), encoding="utf-8").read()
page = r("page_head.html").replace("__FIN_CSS__", r("fin.css")).replace("__FIN_HTML__", r("fin.html")).replace("__FIN_JS__", r("fin.js"))
open(os.path.join(H, "index.html"), "w", encoding="utf-8").write(page)
print("fin page", round(len(page.encode()) / 1024), "KB")
