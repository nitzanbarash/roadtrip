# Research brief 2 — road trip USA, winter 2026–27 (Hebrew output)

An Israeli couple (Nitzan and Oster) drives across the US. Dates and route, in driving order:
- **Before Dec 14, 2026:** New York City → I-95 → Philadelphia → Baltimore → Washington DC → Richmond → the Carolinas → Savannah → Jacksonville → St. Augustine → Daytona → Florida east coast → Miami.
- **Dec 14, 2026: leave Miami** → Florida Turnpike → Orlando → I-75 → Gainesville → Atlanta → Chattanooga → I-24 → Nashville → Paducah KY → I-57/I-64 → St. Louis → I-70 → Kansas City → Kansas → Denver → Loveland Ski Area (they ski) → I-70 west → Grand Junction → Moab area → Green River UT → US-6 → Price → Provo → Salt Lake City → I-80 → Wendover → Elko → Reno → Lake Tahoe/Truckee → Sacramento → San Francisco → coast (Hwy 1) to Los Angeles → I-15 → Las Vegas → US-93 (Hoover Dam, Kingman, Wickenburg) → **Phoenix around Feb 15, 2027**.
- Rough timing (they move at their own pace; treat as a guide only): Florida Dec 14–24 · Georgia/Tennessee/Kentucky/Illinois/Missouri Dec 22–Jan 5 · Kansas/Colorado Jan 1–20 · Utah/Nevada (I-80) Jan 12–28 · California Jan 20–Feb 8 · Las Vegas/Arizona Feb 1–20.

Working directory for files: `/tmp/claude-0/-home-user-social-media-/354aee08-0932-5db4-9b55-220311cf0e01/scratchpad/trip/new2/`

## Common rules
- Facts must be real. Use WebSearch (and WebFetch where useful) to check names, dates, prices, opening in winter. Never invent places or events.
- Hebrew fields: short, simple, casual Hebrew. English only for proper names.
- `coords`: [lat, lng] of the place itself, 4 decimals, lng negative, lat 24–50, lng -125 to -66.
- Write the JSON with a Python script via Bash (json.dump, ensure_ascii=False, indent=1), then reload it and verify every item has all fields and valid coords.
- Skip places already in `existing_names.json` (fields e=name, l=town, s=segment). Check by name.
- Final reply: ONLY one line per file written — the path and the item count.

## Segment ids (use exactly)
nyc, mid_atlantic, carolinas, ga_fl_coast, fl_east, miami, florida_north, georgia, tennessee, ky_il, missouri, kansas, colorado, moab, utah_north, nevada80, tahoe_sac, sf, hwy1, la, la2lv, vegas, phoenix, utah (southern Utah detour from Vegas), arizona (northern Arizona detour from Phoenix).

## A. Far attractions (3.5–5 hours off the route)
File `attr_<region>.json` = `{"attractions": [...]}`. Same objects as the earlier pass:
name_en, name_he, segment_id (the nearest segment), kind (ONE of: national_park, state_park, hike, waterfall, canyon, cave, scenic, camping, beach, lake_river, springs, water_park, theme_park, karting, adventure, ski, museum, zoo_aquarium, city, shopping, quirky, food), wow (1–5), detour (Hebrew one-way extra driving, here "+3:30 שעות" … "+5 שעות"), city_state ("Town, Full State Name"), why (1–2 sentences), tip (one practical tip), cost, time_needed, season (how it is IN WINTER), coords.
Only places worth the long drive (wow 4–5, a few 3s). Spread along the whole region. Mix nature, big parks, famous sights, fun.

## B. Cheap and free places to sleep (up to ~2 hours off the route)
File `sleep_<region>.json` = `{"attractions": [...]}` with the same fields, where:
- kind is ONE of: `free_camp` (free/dispersed camping: BLM, national forest, free campgrounds, legal free overnight spots in nature), `campground` (cheap established campground: state/national park, county, USFS, KOA tent sites — up to ~$35/night), `hostel` (hostel or very cheap bed), `motel` (cheapest decent motels in an area, under ~$75/night — name a specific property), `car_sleep` (legal overnight parking to sleep in the car: specific Walmart/Cracker Barrel/rest area/truck stop locations known to allow it, Harvest Hosts-type options).
- detour: Hebrew from the route ("על המסלול", "+20 דק׳", "+1:30 שעות", up to "+2 שעות").
- why: what it is, what is there (toilets, water, showers, fire pits), why it's good.
- tip: booking/first-come, road access (dirt road? 4x4?), safety, quiet hours, permits.
- cost: per night ("חינם", "$12 ללילה", "$65 לחדר").
- season: WINTER status (open/closed, snow, cold nights, water off).
Aim: plenty in nature (most of the list), plus the cheapest roofs. Cover the whole region evenly, every ~100–150 miles at least one option.

## C. Events along the route (by state and date)
File `events_<region>.json` = `{"events": [...]}`. Each event:
| field | content |
|---|---|
| name_en | official name |
| name_he | Hebrew name |
| state | full state name |
| city | town |
| venue | venue / area |
| start, end | "YYYY-MM-DD" (same day if one day) |
| confirmed | true if dates are confirmed for this 2026–27 season; false if estimated from the yearly pattern (then say so in `tip`) |
| type | ONE of: concert, sports, motorsport, festival, market, fair, rodeo, parade, holiday, show, other |
| segment_id | nearest segment |
| why | Hebrew: what it is and why it's special |
| tip | Hebrew: tickets, cost, how early to book, crowds |
| cost | e.g. "חינם", "$40+", "כרטיסים מ-$120" |
| url | official link |
| coords | [lat, lng] of the venue |
Big and special things: huge festivals, holiday light shows and Christmas markets, New Year's Eve celebrations, parades (Rose Parade, Mardi Gras-style, Gasparilla), rodeos and stock shows, big fairs and swap meets / giant markets (e.g. Quartzsite, Tucson Gem Show), motorsport (Daytona, NASCAR, Formula/IndyCar, off-road races, monster trucks), major sports (bowl games, NBA/NFL/NHL headline games, Super Bowl week, golf like the WM Phoenix Open), big concerts/residencies, art/film festivals (Sundance), ski-town festivals, cultural celebrations (Lunar New Year parades, etc.).
Window: Dec 1, 2026 – Feb 20, 2027, matched to when they are roughly in that state (see timing), but include anything truly huge in the state during the whole window. Several per state; more in big states.
