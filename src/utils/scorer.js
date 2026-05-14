import { haversine } from '../corridorFilter.js'
import { NATIONAL_PARKS } from '../data/nationalParks.js'

const NP_RADIUS_MILES = 50

export function nearestPark(site) {
  let minDist = Infinity
  let nearest = null
  for (const np of NATIONAL_PARKS) {
    const d = haversine([site.lat, site.lng], [np.lat, np.lng])
    if (d < minDist) { minDist = d; nearest = np }
  }
  return { park: nearest, miles: Math.round(minDist) }
}

export function isNearPark(site) {
  return nearestPark(site).miles <= NP_RADIUS_MILES
}

// Raw score 0–7; used for sorting/scoring in GenieStops
export function genieScoreRaw(site) {
  let score = 0
  if (site.hookup_types?.includes('full')) score += 3
  else if (site.hookup_types?.includes('electric')) score += 2
  else if (site.hookup_types?.includes('water')) score += 1
  if (site.is_reservable) score += 1
  if (site.access_pass_discount) score += 1
  if (isNearPark(site)) score += 1
  if (site.agency_type === 'TT' || site.agency_type === 'Encore') score += 1
  return score
}

// 1–5 star rating for display
export function genieScore(site) {
  return Math.max(1, Math.round((genieScoreRaw(site) / 7) * 5))
}
