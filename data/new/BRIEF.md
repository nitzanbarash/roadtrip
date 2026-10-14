# Research brief — road-trip attractions (Hebrew output)

An Israeli couple is driving across the US in WINTER (late December – January; they ski at
Loveland Ski Area, Colorado, in early January). Route, in driving order:
Miami → Florida Turnpike → Orlando → I-75 → Atlanta → Chattanooga → I-24 → Nashville → Paducah KY
→ I-57/I-64 → St. Louis → I-70 → Kansas City → Kansas → Denver → Loveland Ski Area → I-70 west
→ Grand Junction → Green River UT → US-6 → Price → Provo → Salt Lake City → I-80 → Wendover
→ Elko → Reno → Lake Tahoe/Truckee → Sacramento → San Francisco → coast to Los Angeles
→ I-15 → Las Vegas → US-93 (Hoover Dam, Kingman, Wickenburg) → Phoenix.

They want EVERYTHING worth stopping for: national/state parks, hikes, waterfalls, canyons, caves,
scenic viewpoints, lakes, hot springs, water parks (indoor ones matter in winter), amusement parks,
go-karting, ski areas, adventure (zip lines, rafting, off-road, trampoline parks), camping,
museums, zoos/aquariums, fun city experiences, quirky roadside attractions, famous food stops,
and outlet malls / big malls. Detours of up to ~3.5 hours one way are OK.

## Output format

Write one file per segment: `<DIR>/new/<segment_id>.json` containing
`{"attractions": [ ... ]}` — see `<DIR>/new/example.json` for two real examples.
Each attraction object:

| field | content |
|---|---|
| name_en | Official English name (used for Google Maps search, so make it searchable) |
| name_he | Hebrew name (transliteration or short translation) |
| segment_id | the segment id you were given |
| kind | ONE of: national_park, state_park, hike, waterfall, canyon, cave, scenic, camping, beach, lake_river, springs, water_park, theme_park, karting, adventure, ski, museum, zoo_aquarium, city, shopping, quirky, food |
| wow | 1–5 (5 = unmissable must-see, 4 = great, 3 = good filler) |
| detour | Hebrew, one-way extra driving from the route: "על המסלול", "+15 דק׳", "+40 דק׳", "+1:30 שעות", "+3 שעות" |
| city_state | "Town, State" with the full state name, e.g. "Chattanooga, Tennessee" |
| why | Hebrew, 1–2 short sentences: what it is and why it's worth it |
| tip | Hebrew, one practical tip (parking, best time, tickets, what to skip) |
| cost | Hebrew/short, e.g. "חינם", "$35 למבוגר", "$30 לרכב" |
| time_needed | Hebrew, e.g. "שעה", "2-3 שעות", "יום שלם" |
| season | Hebrew — say clearly how it is IN WINTER (Dec–Jan): "פתוח כל השנה", "מצוין בחורף", "סגור בחורף (פתוח מאי–ספטמבר)", "שלג — צריך שרשראות", etc. |
| coords | [lat, lng] of the attraction ITSELF (entrance / visitor center / trailhead / parking), 4 decimals, longitude negative. Not the town centre. |

Style: short, simple, casual Hebrew (the user asked for short texts). No English inside Hebrew
fields except proper names. Facts must be real — use WebSearch to check opening status, prices,
and anything you are unsure of. Don't invent places.

## Rules
- Aim for the target count you were given, spread along the whole segment (not only the big city).
- Mix categories: lots of nature, plus action/fun, some culture, food, quirky, shopping.
- Winter matters: prioritise things that work in Dec–Jan and flag summer-only ones in `season`
  (still include the famous summer-only ones, flagged). Include indoor water parks, indoor
  karting, trampoline parks, hot springs, and ski areas where relevant.
- Skip anything already in `<DIR>/new/existing_names.json` (1,030 places from an earlier pass,
  fields e=name, l=town, s=segment). Check by name before adding.
- Write the file with a Python script via Bash (json.dump, ensure_ascii=False), then reload it
  to verify it parses and every item has all fields and valid coords (lat 24–50, lng -125 to -66).
- Final reply: ONLY one line per file — the path and the item count.
