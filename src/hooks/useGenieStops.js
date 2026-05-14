import { haversine } from '../corridorFilter.js'
import { genieScoreRaw } from '../utils/scorer.js'

const INTERVAL_MILES = 200  // ~3.3hr at 60 mph

function totalPolylineLength(polyline) {
  let total = 0
  for (let i = 1; i < polyline.length; i++) total += haversine(polyline[i - 1], polyline[i])
  return total
}

function interpolateAlongPolyline(polyline, targetMiles) {
  let acc = 0
  for (let i = 1; i < polyline.length; i++) {
    const seg = haversine(polyline[i - 1], polyline[i])
    if (acc + seg >= targetMiles) {
      const t = seg > 0 ? (targetMiles - acc) / seg : 0
      return [
        polyline[i - 1][0] + t * (polyline[i][0] - polyline[i - 1][0]),
        polyline[i - 1][1] + t * (polyline[i][1] - polyline[i - 1][1]),
      ]
    }
    acc += seg
  }
  return polyline[polyline.length - 1]
}

function scoreSite(site, dist) {
  return genieScoreRaw(site) * 10 - dist * 0.5
}

/**
 * Suggest campground stops at ~200-mile intervals along the polyline.
 * Returns [{campground, alternatives:[]}] in route order.
 */
export function suggestStops(campgrounds, polyline, searchRadiusMiles = 40) {
  if (!polyline || polyline.length < 2 || !campgrounds?.length) return []

  const totalMiles = totalPolylineLength(polyline)
  if (totalMiles < INTERVAL_MILES) return []

  const usedIds = new Set()
  const suggestions = []
  let d = INTERVAL_MILES

  while (d < totalMiles - INTERVAL_MILES * 0.4) {
    const pt = interpolateAlongPolyline(polyline, d)

    const candidates = campgrounds
      .filter((s) => !usedIds.has(s.site_id))
      .map((s) => ({ s, dist: haversine(pt, [s.lat, s.lng]) }))
      .filter(({ dist }) => dist <= searchRadiusMiles)
      .map(({ s, dist }) => ({ s, dist, score: scoreSite(s, dist) }))
      .sort((a, b) => b.score - a.score)

    if (candidates.length > 0) {
      usedIds.add(candidates[0].s.site_id)
      suggestions.push({
        campground: candidates[0].s,
        alternatives: candidates.slice(1, 4).map((c) => c.s),
      })
    }
    d += INTERVAL_MILES
  }

  return suggestions
}
