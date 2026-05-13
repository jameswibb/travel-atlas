# Travel Atlas — Claude Code Context

Read this file at the start of every session. Do not begin coding until you have read it.

## Stack

- React 19 + Vite
- react-leaflet v5 (requires React 19 — do NOT downgrade)
- react-leaflet-cluster (marker clustering — must always be enabled, never render unclustered pins)
- react-router-dom v7
- localStorage (saved routes, no backend, no auth)
- Vercel (deploy from GitHub)

## Project Structure

```
travel-atlas/
  public/
    campgrounds.json        ← static data, 3186 sites, loaded at runtime
  src/
    App.jsx
    complianceEngine.js     ← Phase 0 blocker: standalone, zero UI deps
    complianceEngine.test.js
    corridorFilter.js       ← Phase 0 spike: Haversine point-to-polyline
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

All 5 rule combos plus the non-aggregation rule MUST pass unit tests before any UI work.

## Rig Profile

| Field | Value |
|---|---|
| Vehicle | Ford F-450 truck + Soaring Eagle Earie camper |
| Length | ~25 ft |
| Height | 13 ft |
| Party | Sir + Lady Sara + Biscuit + Roo (2 dogs) |

## Won't Have — Do Not Build

- Conversational Claude editing interface
- Live API calls (Recreation.gov, TT, Harvest Hosts)
- Scenic routing algorithm
- Multi-user / auth / accounts
- Weather, traffic, or fuel integrations
- Mobile native app

## Build Order (phases)

1. **Phase 0 (current):** complianceEngine.js passes all 5 unit tests + corridor spike passes visual check
2. **Phase 1:** Core loop — route input, corridor filter, itinerary builder, night-coverage checker, compliance alerts wired to UI, save/load routes
3. **Phase 2:** Polish — NP proximity flags, adaptive distance, corridor slider, mobile layout

Do not start Phase 1 until Phase 0 validation checkpoints are all green.
