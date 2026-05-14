# Travel Atlas — Claude Code Context

Read this file at the start of every session. Do not begin coding until you have read it.

## Stack

- React 19 + Vite
- react-leaflet v5 (requires React 19 — do NOT downgrade)
- react-leaflet-cluster (marker clustering — must always be enabled, never render unclustered pins)
- react-router-dom v7
- localStorage (saved routes, no backend, no auth)
- Vercel (deploy from GitHub)
- vite.config.js has `resolve.dedupe: ['react','react-dom','leaflet']` — do not remove, fixes hook errors

## Project Structure

```
travel-atlas/
  public/
    campgrounds.json        ← static data, 3186 sites, loaded at runtime
  src/
    App.jsx                 ← layout shell, top-level state
    App.css                 ← all component styles
    geocode.js              ← Nominatim search helper
    complianceEngine.js     ← pure JS, zero UI deps
    complianceEngine.test.js
    corridorFilter.js       ← Haversine point-to-polyline
    hooks/
      useCampgrounds.js     ← load + hard-filter campgrounds.json
      useItinerary.js       ← useReducer for itinerary state
      useSavedRoutes.js     ← localStorage TRAVEL_ATLAS_V1_ROUTES
    components/
      CampMap.jsx           ← Leaflet map, clustered markers, polyline
      RouteForm.jsx         ← start/end/dates
      FilterBar.jsx         ← corridor slider, hookup chips, toggles
      LocationSearch.jsx    ← debounced Nominatim dropdown
      ItineraryPanel.jsx    ← stops list, compliance alerts, gap warnings, save/load
  build_campgrounds.py      ← re-run to refresh campgrounds.json from My Maps
  patch_campgrounds.py      ← geocoding retry / cleanup utility
  CLAUDE.md                 ← this file
```

## campgrounds.json Schema

Every record in `public/campgrounds.json` has these fields:

```json
{
  "site_id": "tt_0001_hiddencove",
  "name": "Hidden Cove",
  "lat": 34.0567,
  "lng": -87.1471,
  "agency_type": "TT | Encore | USFS | NPS | USACE | BLM | FWS",
  "is_encore": false,
  "tt_zone": "NE | SE | MW | W | TX | FL | null",
  "is_dog_friendly": true,
  "max_rig_length_ft": 40.0,
  "height_clearance_ft": 15.0,
  "hookup_types": ["electric | water | sewer | full | none"],
  "amp_available": "30A | 50A | both | null",
  "is_reservable": true,
  "booking_url": "https://...",
  "stay_limit_nights": 14,
  "access_pass_discount": false,
  "restroom_proximity": null,
  "nearby_national_parks": []
}
```

### Important data quality notes

- `height_clearance_ft`: only ~9% of federal sites have this field populated. Filter to EXCLUDE sites where it is known to be < 13ft. Show all null-clearance sites (clearance unknown = show, not hide).
- `max_rig_length_ft`: 76% of federal sites have this. Same logic: exclude known < 25ft, show unknown.
- `tt_zone`: Only TT-type sites have zones. Accessible zones for this membership: NE and SE only. Encore (`is_encore: true`) is accessible nationwide regardless of zone.
- TT/Encore sites have no `height_clearance_ft` or `max_rig_length_ft` (null). Do not filter them out on those fields.

## Hard Filters (applied on load, always on)

1. `is_dog_friendly === true` (Biscuit and Roo)
2. `height_clearance_ft === null || height_clearance_ft >= 13` (13ft rig height)
3. `max_rig_length_ft === null || max_rig_length_ft >= 25` (25ft rig length)
4. For `agency_type === 'TT'`: `tt_zone === 'NE' || tt_zone === 'SE'` — all other TT zones excluded
5. Encore (`is_encore: true`): no zone restriction

## React State Shape

```js
// Route state
{
  startLocation: { lat, lng, label } | null,
  endLocation:   { lat, lng, label } | null,
  waypoints:     [{ lat, lng, label }],
  tripStartDate: 'YYYY-MM-DD' | null,
  tripEndDate:   'YYYY-MM-DD' | null,
}

// Itinerary state (useReducer)
{
  stops: [
    {
      stopId: string,       // uuid
      campground: site,     // full campground object from campgrounds.json
      arriveDate: 'YYYY-MM-DD',
      departDate: 'YYYY-MM-DD',
      nights: number,
      notes: string,
    }
  ]
}

// Compliance state (derived — never stored, always computed)
// Output of complianceEngine.checkCompliance(itinerary.stops)
[
  {
    stop_index: number,
    violation_type: 'FULL_SYSTEM_LOCKOUT' | 'ENCORE_LOCKOUT' | 'TT_ZONE_BLOCKED',
    explanation: string,
    earliest_legal_date: 'YYYY-MM-DD',
  }
]

// Filter state
{
  corridorMiles: 25,
  hookupTypes: [],        // [] = any
  showFCFS: true,
  showReservable: true,
}

// Saved routes (localStorage key: 'TRAVEL_ATLAS_V1_ROUTES')
{
  version: 1,
  routes: [
    {
      routeId: string,
      name: string,
      savedAt: ISO string,
      route: { startLocation, endLocation, waypoints, tripStartDate, tripEndDate },
      itinerary: { stops },
    }
  ]
}
```

## Compliance Engine — Decision Matrix

File: `src/complianceEngine.js` — pure JS, zero UI dependencies.

Two independent counters:

| Last Stay | Nights | Can go TT? | Can go Encore? |
|---|---|---|---|
| Standard TT | ≤ 4 | Yes | Yes |
| Standard TT | > 4 | No — 7 nights out | No — 7 nights out (full system) |
| Encore | ≤ 4 | Yes | No — 7 nights out of Encore only |
| Encore | > 4 | No — 7 nights out | No — 7 nights out (full system) |

Key rules:
- Rules do NOT aggregate across parks. 3 nights Park A + 3 nights Park B = no lockout.
- Full-system lockout = 7 consecutive nights outside ALL TT/Encore properties.
- Encore-only lockout = 7 consecutive nights outside Encore only (standard TT still accessible).
- Standard TT parks outside NE/SE zones are blocked entirely (not a lockout — zone restriction).
- TT max stay: 14 nights (display warning, not hard block).

### complianceEngine.js exports

```js
checkCompliance(stops)
// stops: array of { site_id, agency_type, is_encore, tt_zone, arrive_date, depart_date }
// returns: array of violations { stop_index, violation_type, explanation, earliest_legal_date }

getLockoutState(stops, upToIndex)
// returns: { fullSystemLockoutEnds: 'YYYY-MM-DD'|null, encoreLockoutEnds: 'YYYY-MM-DD'|null }
```

## Rig Profile

| Field | Value |
|---|---|
| Vehicle | Ford F-450 truck + Soaring Eagle Earie camper |
| Length | ~25 ft |
| Height | 13 ft |
| Party | Sir + Lady Sara + Biscuit + Roo (2 dogs) |
| Max daily drive | ~4 hours / ~240 miles at 60 mph |
| Fuel economy | ~7 MPG — default corridor narrow, widen on instruction |

## Won't Have — Do Not Build

- Conversational Claude editing interface (v2)
- Live API calls (Recreation.gov, TT, Harvest Hosts)
- Scenic routing algorithm
- Multi-user / auth / accounts
- Weather, traffic, or fuel integrations
- Mobile native app
- Offline / PWA caching

## Build Order (phases)

### Phase 0 — COMPLETE ✓
- complianceEngine.js passes all 22 unit tests
- corridorFilter.js corridor spike passes visual check (DC→Boston)
- campgrounds.json: 3,186 sites, full schema
- React 19 + Vite scaffold, full-screen Leaflet map confirmed
- GitHub repo: github.com/jameswibb/travel-atlas

### Phase 1 — COMPLETE ✓
Core loop working:
- Route input with Nominatim geocoding
- Corridor filter wired to route, 25mi default
- CampMap with clustered colour-coded markers
- Itinerary builder: add/remove stops, +/- nights, date re-chaining
- Compliance engine wired to itinerary, per-stop alerts
- Gap warnings between stops
- Save/load named routes via localStorage
- Filter bar: corridor slider, hookup chips, FCFS/reservable toggles

**Phase 1 items still to complete:**
- [ ] Site detail card (currently tooltip only — need full card with hookups, amp, FCFS badge, Access Pass badge, stay limit, booking URL)
- [ ] Night-coverage checker: `useNightCoverage.js` hook + persistent `NightCoverageIndicator.jsx` banner (always visible, green=covered, red=gaps with specific dates listed)
- [ ] Print view — clean single-page itinerary summary for road use
- [ ] TT 14-night maximum stay warning (display only)
- [ ] End-to-end test: plan a real section of the east coast trip

### Phase 2 — TODO
Trip-ready polish:

**NP proximity flags**
- For each campground, calculate distance to nearest National Park from a static NPS coordinates list
- Display badge on site cards for any NP within 50 miles
- `nearby_national_parks` field already exists in schema (currently empty — needs populating or computing at render time)

**Adaptive distance suggestions**
- Calculate drive distance between consecutive stops (straight-line / 60mph)
- Flag any leg exceeding 4 hours (~240 miles) on the itinerary
- Track consecutive driving days for dynamic weighting (soft, can override)

**Alternative campground suggestions**
- On each stop card, show 3 nearby alternatives within the same corridor segment
- Let Sir swap a stop from the shortlist

**Suitability score** (Adventure Genie-inspired GenieScore)
- Composite: hookup match + dog-friendly + reservable + NP proximity + Access Pass discount
- Display as stars or numeric on site cards

**Per-stop notes** (trivially easy, low priority)

**GenieStops — suggested stops mode**
- When route entered, pre-populate stop suggestions at ~3-4hr intervals
- Let Sir replace any suggestion

**Mobile responsive layout pass**
- Sidebar must work on iPad/phone
- Map + itinerary both accessible on small screens

**Bug fix sprint**
- Use Travel Atlas to plan the full July–November east coast route
- Fix every friction point encountered

### Phase 2 Validation Checkpoint (done when):
Sir has planned the complete July–November east coast adventure in Travel Atlas, every night is covered, the compliance engine shows green across the full itinerary, and he is comfortable booking from it.

## Competitive Context

Adventure Genie (adventuregenie.com) is the closest competitor — AI RV planner, 25k+ campgrounds, drag-and-drop, GenieScore. Its structural gap: **zero TT/Encore membership support**. Travel Atlas's compliance engine is the exact feature Adventure Genie cannot provide.

Features to adopt from Adventure Genie:
- GenieScore suitability rating per site
- Split-pane UI (map always visible) — done
- Day-by-day itinerary view with explicit arrival/departure dates — done
- GenieStops (suggested stops at 3-4hr intervals) — Phase 2
- Favourite/bookmark sites (heart icon, localStorage) — Phase 2

## Source Documents

Full planning documents at:
`C:\Users\Admin\Documents\MegaClaude\App Workshop\App Workshop\`
- Travel_Atlas_Build_Plan.docx
- Travel_Atlas_MVP_Scope.docx
- Travel_Atlas_Requirements_Brief.docx
- Travel_Atlas_Validation_Report.docx
