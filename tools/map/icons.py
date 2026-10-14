#!/usr/bin/env python3
# Map marker glyphs: Material Symbols Rounded (Apache 2.0) outlines as SVG paths on a 24-unit, y-down grid,
# plus a few hand-drawn ones the font lacks. The app draws them into round badges at runtime (no font needed offline).
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.environ.get("ICON_FONT") or os.path.join(HERE, "..", "icons", "full.woff2")
NAMES = """local_gas_station ev_station forest park attractions museum hiking landscape water_drop waves beach_access pool camping
downhill_skiing sports_motorsports paragliding pets set_meal location_city shopping_bag auto_awesome restaurant local_cafe hotel
local_pharmacy local_hospital medical_services atm wc local_parking info theater_comedy movie casino account_balance car_rental
hot_tub stadium flight icecream bakery_dining golf_course local_library local_post_office local_police local_florist fastfood
local_bar sports_bar storefront star shopping_cart rest_area kayaking fort palette build liquor checkroom mountain_flag
directions_car photo_camera music_note trophy sports_score celebration festival event agriculture cabin bed airline_seat_flat night_shelter rv_hookup theater_comedy sports_football""".split()
# hand-drawn (24 grid, y-down); "h" marks parts punched out in the badge color
CUSTOM = {
    "rodeo": {"d": "M8.2 6.5c.6-1.8 2.2-1.6 3.8-.6 1.6-1 3.2-1.2 3.8.6l1.4 6.2c1.6-.5 3.2-1.4 4.3-2.6.6.9.2 2.6-1.3 4-2 1.9-5.1 3-8.2 3s-6.2-1.1-8.2-3C2.3 12.7 1.9 11 2.5 10.1c1.1 1.2 2.7 2.1 4.3 2.6z", "b": [2.2, 5, 21.8, 17.2]},
    "binoculars": {"d": "M4 4h6v9H4zM14 4h6v9h-6zM10 8h4v4h-4zM2.4 16a4.6 4.6 0 1 1 9.2 0a4.6 4.6 0 1 1-9.2 0zM12.4 16a4.6 4.6 0 1 1 9.2 0a4.6 4.6 0 1 1-9.2 0z",
                   "h": "M4.8 16a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1-4.4 0zM14.8 16a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1-4.4 0z", "b": [2.4, 4, 21.6, 20.6]},
    "waterfall": {"d": "M3 3h18v3.2h-2.2v9.3a1 1 0 0 1-2 0V6.2h-2.8v11.3a1 1 0 0 1-2 0V6.2H9.2v9.3a1 1 0 0 1-2 0V6.2H3zM2.5 19.6c1.6 0 2.4-.9 4.8-.9s3.2 1.4 4.7 1.4 2.3-1.4 4.7-1.4 3.2.9 4.8.9V22H2.5z", "b": [2.5, 3, 21.5, 22]},
    "cave": {"d": "M1.5 21C2 12.5 6.5 4 12 4s10 8.5 10.5 17z", "h": "M7.5 21c0-4.6 2-8.2 4.5-8.2s4.5 3.6 4.5 8.2z", "b": [1.5, 4, 22.5, 21]},
    "lighthouse": {"d": "M9.2 7.5h5.6l1.6 13.5H7.6zM9 4.2 12 1.8l3 2.4v2.2H9zM16.6 4.6l4.6-1.6v2.3l-4.6.6zM16.6 6.4l4.6.6v2.3l-4.6-1.6zM7.4 4.6 2.8 3v2.3l4.6.6zM7.4 6.4 2.8 7v2.3l4.6-1.6z",
                   "h": "M9.6 12.2h4.8v1.8H9.6zM9.1 16.4h5.8v1.8H9.1z", "b": [2.8, 1.8, 21.2, 21]},
}


def main():
    f = TTFont(FONT)
    gs = f.getGlyphSet()
    upm = f["head"].unitsPerEm
    byname = {}
    for cp, g in f.getBestCmap().items():
        byname.setdefault(g, cp)
    out = {}
    for n in NAMES:
        if n not in gs:
            sys.exit("missing glyph " + n)
        # Material Symbols sit on the baseline with descent below; map the em box to 0..24 y-down
        s = 24.0 / upm
        bp = BoundsPen(gs); gs[n].draw(bp)
        sp = SVGPathPen(gs, ntos=lambda v: ("%.1f" % v).rstrip("0").rstrip("."))
        gs[n].draw(TransformPen(sp, (s, 0, 0, -s, 0, 0)))
        x0, y0, x1, y1 = bp.bounds
        out[n] = {"d": sp.getCommands(), "b": [round(x0 * s, 2), round(-y1 * s, 2), round(x1 * s, 2), round(-y0 * s, 2)]}
    for n, c in CUSTOM.items():
        out[n] = c
    json.dump(out, open(os.path.join(HERE, "icons.json"), "w"), separators=(",", ":"))
    print(len(out), "glyphs,", round(os.path.getsize(os.path.join(HERE, "icons.json")) / 1024), "KB")


if __name__ == "__main__":
    main()
