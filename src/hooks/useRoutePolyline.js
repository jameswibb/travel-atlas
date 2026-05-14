import { useState, useEffect } from 'react'

// OSRM public API — no key required, OSM road data
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

function buildUrl(points) {
  const coords = points.map(({ lat, lng }) => `${lng},${lat}`).join(';')
  return `${OSRM_BASE}/${coords}?overview=simplified&geometries=geojson&annotations=false`
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
const METERS_PER_MILE = 1609.34

export function useRoutePolyline(route) {
  const [polyline, setPolyline] = useState([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeDistanceMiles, setRouteDistanceMiles] = useState(null)
  const [routeDurationHours, setRouteDurationHours] = useState(null)

  const routeKey = [
    route.startLocation ? `${route.startLocation.lat},${route.startLocation.lng}` : '',
    ...(route.waypoints ?? []).filter(Boolean).map((w) => `${w.lat},${w.lng}`),
    route.endLocation ? `${route.endLocation.lat},${route.endLocation.lng}` : '',
  ].join('|')

  useEffect(() => {
    const { startLocation, endLocation, waypoints = [] } = route
    if (!startLocation || !endLocation) {
      setPolyline([])
      setRouteDistanceMiles(null)
      setRouteDurationHours(null)
      return
    }

    const points = [startLocation, ...waypoints.filter(Boolean), endLocation]
    const controller = new AbortController()
    setRouteLoading(true)

    fetch(buildUrl(points), { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const route0 = data?.routes?.[0]
        const coords = route0?.geometry?.coordinates
        setPolyline(coords?.length ? toLatLng(coords) : straightLine(points))
        if (route0?.distance) setRouteDistanceMiles(Math.round(route0.distance / METERS_PER_MILE))
        if (route0?.duration) setRouteDurationHours(Math.round(route0.duration / 3600 * 10) / 10)
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

  return { polyline, routeLoading, routeDistanceMiles, routeDurationHours }
}
