const BASE = 'https://nominatim.openstreetmap.org/search'
const UA = 'TravelAtlas/1.0 (jameswibb@gmail.com)'

/**
 * Search for locations matching `query`. Returns up to 5 results.
 * @param {string} query
 * @returns {Promise<Array<{lat:number, lng:number, label:string}>>}
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) return []
  const url =
    `${BASE}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  const data = await res.json()
  return data.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    label: r.display_name,
  }))
}
