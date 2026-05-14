import { useState, useEffect } from 'react'

// OSRM public API — no key required, OSM road data
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

function buildUrl(points) {
  const coords = points.map(({ lat, lng }) => `${lng},${lat}`).join(';')
  return `${OSRM_BASE}/${coords}?overview=simplified&geometries=geojson`
}

// OSRM returns [lng, lat]; Leaflet needs [lat, lng]
function toLatLng(coords) {
  return coords.map(([lng, lat]) => [lat, lng])
}

function straightLine(points) {
  return points.map(({ lat, lng }) => [lat, lng])
}

/**
 * Fetches a real driving route from OSRM.
 * Falls back to straight-line if the fetch fails or route is incomplete.
 */
export function useRoutePolyline(route) {
  const [polyline, setPolyline] = useState([])
  const [routeLoading, setRouteLoading] = useState(false)

  // Stable string key — avoids re-fetching when route object reference changes
  const routeKey = [
    route.startLocation ? `${route.startLocation.lat},${route.startLocation.lng}` : '',
    ...(route.waypoints ?? []).map((w) => `${w.lat},${w.lng}`),
    route.endLocation ? `${route.endLocation.lat},${route.endLocation.lng}` : '',
  ].join('|')

  useEffect(() => {
    const { startLocation, endLocation, waypoints = [] } = route
    if (!startLocation || !endLocation) {
      setPolyline([])
      return
    }

    const points = [startLocation, ...waypoints, endLocation]
    const controller = new AbortController()
    setRouteLoading(true)

    fetch(buildUrl(points), { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates
        setPolyline(coords?.length ? toLatLng(coords) : straightLine(points))
      })
      .catch(() => {
        if (!controller.signal.aborted) setPolyline(straightLine(points))
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  return { polyline, routeLoading }
}
