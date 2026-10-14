#!/usr/bin/env python3
# Builds the road-trip artifact page from the workflow's agent results.
import json, re, os, sys, glob

WF = "/root/.claude/projects/-home-user-social-media-/354aee08-0932-5db4-9b55-220311cf0e01/subagents/workflows/wf_14b3f99d-ed4"
HERE = os.path.dirname(os.path.abspath(__file__))

SEGMENTS = [
    ("sf",            "סן פרנסיסקו ואזור המפרץ",            "San Francisco Bay Area",       "101", "0",           "var(--route)"),
    ("hwy1",          "כביש החוף 1 → לוס אנג׳לס",            "Pacific Coast Highway",        "1",   "0–470",       "var(--park)"),
    ("la",            "לוס אנג׳לס וסביבתה",                  "Greater Los Angeles",          "405", "470",         "var(--neon)"),
    ("la2lv",         "המדבר: לוס אנג׳לס → לאס וגאס",        "Mojave Desert",                "15",  "470–740",     "var(--mile)"),
    ("vegas",         "לאס וגאס והסביבה",                    "Las Vegas",                    "15",  "740",         "var(--neon)"),
    ("utah",          "דרום יוטה: ציון, בריס והקניונים",     "Southern Utah",                "9",   "740–1,000",   "var(--park)"),
    ("arizona",       "אריזונה: פייג׳, גרנד קניון, סדונה",   "Northern Arizona",             "89",  "1,000–1,400", "var(--mile)"),
    ("moab",          "מואב ומערב קולורדו",                  "Moab & Western Colorado",      "70",  "1,400–1,850", "var(--mile)"),
    ("colorado",      "וינטר פארק, דנוור והרוקיז",           "Winter Park & the Rockies",    "40",  "1,850–2,150", "var(--park)"),
    ("nm_tx_north",   "ניו מקסיקו וצפון טקסס",               "New Mexico & North Texas",     "25",  "2,150–2,800", "var(--mile)"),
    ("dallas",        "דאלאס, פורט וורת׳ וטקסס",             "Dallas–Fort Worth",            "35",  "2,800–3,050", "var(--route)"),
    ("louisiana",     "לואיזיאנה וניו אורלינס",              "Louisiana & New Orleans",      "10",  "3,050–3,550", "var(--neon)"),
    ("gulf",          "חוף המפרץ: אלבמה ופנהנדל פלורידה",    "The Gulf Coast",               "10",  "3,550–3,950", "var(--route)"),
    ("florida_north", "צפון ומרכז פלורידה → אורלנדו",        "North & Central Florida",      "4",   "3,950–4,400", "var(--park)"),
    ("miami",         "מיאמי, אוורגליידס והקיז",             "Miami, Everglades & the Keys", "1",   "4,400–4,610", "var(--neon)"),
]
SEG_IDS = [s[0] for s in SEGMENTS]

GROUPS = [
    ("nature",  "טבע ופארקים",     "var(--park)"),
    ("water",   "מים וחופים",       "var(--water)"),
    ("action",  "אקשן ואדרנלין",    "var(--neon)"),
    ("culture", "מוזיאונים וחיות",  "var(--route)"),
    ("shop",    "קניות",            "var(--mile)"),
    ("odd",     "מוזר, אוכל ועוד",  "var(--odd)"),
]

KINDS = {
    "national_park": ("פארק לאומי",     "nature"),
    "state_park":    ("פארק מדינתי",    "nature"),
    "hike":          ("מסלול הליכה",    "nature"),
    "waterfall":     ("מפל",            "nature"),
    "canyon":        ("קניון",          "nature"),
    "cave":          ("מערה",           "nature"),
    "scenic":        ("נוף ותצפית",     "nature"),
    "camping":       ("קמפינג",         "nature"),
    "beach":         ("חוף",            "water"),
    "lake_river":    ("אגם ונהר",       "water"),
    "springs":       ("מעיינות",        "water"),
    "water_park":    ("פארק מים",       "water"),
    "theme_park":    ("לונה פארק",      "action"),
    "karting":       ("קארטינג",        "action"),
    "adventure":     ("אקסטרים",        "action"),
    "museum":        ("מוזיאון",        "culture"),
    "zoo_aquarium":  ("חיות ואקווריום", "culture"),
    "city":          ("עיר וחוויה",     "culture"),
    "shopping":      ("קניות",          "shop"),
    "quirky":        ("מוזר ומגניב",    "odd"),
    "food":          ("אוכל",           "odd"),
}
GROUP_COLOR = {g[0]: g[2] for g in GROUPS}


# ---------------------------------------------------------------- collect
def collect():
    """Pull every structured agent result out of the workflow transcript."""
    out = []
    jpath = os.path.join(WF, "journal.jsonl")
    if os.path.exists(jpath):
        for line in open(jpath, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            for key in ("result", "value", "output", "data"):
                v = d.get(key)
                if isinstance(v, dict) and isinstance(v.get("attractions"), list):
                    out.extend(v["attractions"])
                elif isinstance(v, str) and '"attractions"' in v:
                    try:
                        vv = json.loads(v)
                        if isinstance(vv.get("attractions"), list):
                            out.extend(vv["attractions"])
                    except Exception:
                        pass
    if out:
        return out
    # fallback: dig the StructuredOutput tool calls out of each agent transcript
    for f in sorted(glob.glob(os.path.join(WF, "agent-*.jsonl"))):
        blob = open(f, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'"attractions"\s*:\s*\[', blob):
            start = m.start() - 1
            while start >= 0 and blob[start] != "{":
                start -= 1
            depth, i, instr, esc = 0, start, False, False
            while i < len(blob):
                c = blob[i]
                if instr:
                    if esc:
                        esc = False
                    elif c == "\\":
                        esc = True
                    elif c == '"':
                        instr = False
                elif c == '"':
                    instr = True
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            try:
                obj = json.loads(blob[start:i + 1])
                if isinstance(obj.get("attractions"), list):
                    out.extend(obj["attractions"])
            except Exception:
                pass
    return out


# ---------------------------------------------------------------- normalise
HEB_NUM = [("שעתיים", 2.0), ("שעה וחצי", 1.5), ("חצי שעה", 0.5), ("רבע שעה", 0.25)]


def detour_hours(text):
    t = (text or "").strip()
    if not t:
        return 0.0
    low = t.replace("״", '"')
    best = None
    # "+3:30" / "2:15" -> hours.minutes
    for h, m in re.findall(r"(\d+):(\d{2})", low):
        best = max(best or 0, int(h) + int(m) / 60.0)
    if best is not None:
        # "1:15 שעות": the minutes must not be read again as "15 hours"
        return round(min(best, 6.0), 2)
    for word, val in HEB_NUM:
        if word in low:
            best = max(best or 0, val)
    if best is None and re.search(r"(^|[^א-ת])שעה($|[^א-ת])", low):
        best = 1.0
    for num, unit in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:-|–|עד)?\s*(?:\d+(?:[.,]\d+)?)?\s*(דק|שע|h|min)", low):
        v = float(num.replace(",", "."))
        if unit == "דק" or unit == "min":
            v = v / 60.0
        best = max(best or 0, v)
    if best is None:
        if "על המסלול" in low or "במסלול" in low or "בדרך" in low or "on route" in low.lower():
            return 0.0
        nums = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", low)]
        nums = [n for n in nums if n <= 6]
        if nums:
            best = max(nums)
        elif any(w in low for w in ("בתוך", "באזור", "בסמוך", "ליד", "מתוך", "בעיר")):
            # nested inside a destination that is itself off the main route
            best = 1.0
        else:
            best = 0.0
    if "על המסלול" in low and (best is None or best < 0.2):
        best = 0.0
    return round(min(best, 6.0), 2)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60]


def norm(raw):
    items, seen = [], {}
    for a in raw:
        if not isinstance(a, dict):
            continue
        en = (a.get("name_en") or "").strip()
        he = (a.get("name_he") or "").strip() or en
        if not en:
            continue
        sid = (a.get("segment_id") or "").strip()
        if sid not in SEG_IDS:
            continue
        kind = (a.get("kind") or "scenic").strip()
        if kind not in KINDS:
            kind = "scenic"
        try:
            wow = int(round(float(a.get("wow") or 3)))
        except Exception:
            wow = 3
        wow = max(1, min(5, wow))
        det = (a.get("detour") or "על המסלול").strip()
        key = re.sub(r"[^a-z0-9]", "", en.lower())
        item = {
            "id": slug(en) or key,
            "s": sid,
            "k": kind,
            "h": he,
            "e": en,
            "l": (a.get("city_state") or "").strip(),
            "d": det,
            "dh": detour_hours(det),
            "y": (a.get("why") or "").strip(),
            "p": (a.get("tip") or "").strip(),
            "c": (a.get("cost") or "").strip(),
            "t": (a.get("time_needed") or "").strip(),
            "se": (a.get("season") or "").strip(),
            "w": wow,
        }
        ll = a.get("coords") or a.get("latlng")
        if isinstance(ll, (list, tuple)) and len(ll) == 2:
            try:
                la, lo = float(ll[0]), float(ll[1])
                if 24.0 <= la <= 50.0 and -126.0 <= lo <= -66.0:
                    item["g"], item["n"] = round(la, 4), round(lo, 4)
            except Exception:
                pass
        if key in seen:
            old = seen[key]
            if wow > old["w"]:
                old.update(item)
            for f in ("p", "c", "t", "se", "y"):
                if not old.get(f) and item.get(f):
                    old[f] = item[f]
            continue
        seen[key] = item
        items.append(item)
    # unique dom ids
    used = {}
    for it in items:
        base = it["id"] or "x"
        n = used.get(base, 0)
        used[base] = n + 1
        if n:
            it["id"] = base + "-" + str(n)
    # second pass: the same place written two ways in one town
    # ("First Monday Trade Days" / "Canton First Monday Trade Days")
    def bare(t):
        t = re.sub(r"[^a-z0-9 ]", " ", t.lower())
        drop = {"the", "at", "of", "and", "a", "in", "park", "center", "centre", "resort"}
        return " ".join(w for w in t.split() if w not in drop)

    by_city = {}
    for it in items:
        by_city.setdefault(it["l"].lower().strip(), []).append(it)
    dead = set()
    for group in by_city.values():
        for i, a in enumerate(group):
            if id(a) in dead:
                continue
            ba = bare(a["e"])
            for b in group[i + 1:]:
                if id(b) in dead:
                    continue
                bb = bare(b["e"])
                if not ba or not bb:
                    continue
                ta, tb = set(ba.split()), set(bb.split())
                if len(ta) < 2 or len(tb) < 2:
                    continue
                # only a near-identical name counts as the same place: one stray
                # token apart ("First Monday Trade Days" / "Canton First Monday
                # Trade Days"). Anything further is a distinct spot inside the
                # same park (Badwater Basin vs Death Valley National Park).
                if len(ta ^ tb) <= 1:
                    keep, drop_it = (a, b) if a["w"] >= b["w"] else (b, a)
                    for f in ("p", "c", "t", "se", "y"):
                        if not keep.get(f) and drop_it.get(f):
                            keep[f] = drop_it[f]
                    dead.add(id(drop_it))
    if dead:
        items = [it for it in items if id(it) not in dead]

    order = {s: i for i, s in enumerate(SEG_IDS)}
    items.sort(key=lambda x: (order[x["s"]], -x["w"], x["dh"]))
    return items


# ---------------------------------------------------------------- render
def main():
    raw = collect()
    items = norm(raw)
    if not items:
        print("NO ITEMS FOUND", file=sys.stderr)
        sys.exit(1)

    gcount = {g[0]: 0 for g in GROUPS}
    for it in items:
        gcount[KINDS[it["k"]][1]] += 1

    data = {
        "segments": [
            {"id": i, "he": he, "en": en, "road": road, "mile": mile, "color": color}
            for (i, he, en, road, mile, color) in SEGMENTS
        ],
        "kinds": {k: {"he": v[0], "g": v[1], "color": GROUP_COLOR[v[1]]} for k, v in KINDS.items()},
        "groups": [{"id": g[0], "he": g[1], "color": g[2], "count": gcount[g[0]]} for g in GROUPS],
        "items": items,
    }

    # attach coordinates resolved by the geocoding pass, keyed on "name|city"
    cpath = os.path.join(HERE, "coords.json")
    coords = {}
    if os.path.exists(cpath):
        coords = json.load(open(cpath, encoding="utf-8"))
    hit = 0
    for it in items:
        if it.get("g") is not None:
            hit += 1
            continue
        for key in (it["e"].lower().strip(), (it["e"] + "|" + it["l"]).lower().strip(), it["l"].lower().strip()):
            c = coords.get(key)
            if c:
                it["g"], it["n"] = round(float(c[0]), 4), round(float(c[1]), 4)
                hit += 1
                break
    print("with coords:", hit, "/", len(items))

    # stops sharing a town would stack into one dot: fan them out on a small
    # deterministic spiral (~10-30 km) so each is clickable at map scale
    import math
    bucket = {}
    for it in items:
        if it.get("g") is None:
            continue
        key = (round(it["g"], 3), round(it["n"], 3))
        n = bucket.get(key, 0)
        bucket[key] = n + 1
        if n:
            ang = n * 2.39996  # golden angle
            rad = 0.055 * math.sqrt(n)
            it["g"] = round(it["g"] + rad * math.sin(ang), 4)
            it["n"] = round(it["n"] + rad * math.cos(ang) * 1.26, 4)

    geo = open(os.path.join(HERE, "geo.js"), encoding="utf-8").read()
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    html = (tpl
            .replace("__GEO__", geo)
            .replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            .replace("__SEGCOUNT__", str(len(SEGMENTS)))
            .replace("__TOTAL__", str(len(items)))
            .replace("__MUST__", str(sum(1 for i in items if i["w"] >= 5))))
    out = os.path.join(HERE, "roadtrip.html")
    open(out, "w", encoding="utf-8").write(html)

    per = {}
    for it in items:
        per[it["s"]] = per.get(it["s"], 0) + 1
    print("items:", len(items), " raw:", len(raw), " size:", round(len(html) / 1024), "KB")
    for s in SEG_IDS:
        print("  %-14s %3d" % (s, per.get(s, 0)))
    print("groups:", gcount)
    print("must:", sum(1 for i in items if i["w"] >= 5))
    print("wrote", out)


if __name__ == "__main__":
    main()
