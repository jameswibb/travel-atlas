import { useState, useEffect } from 'react'

const METERS_PER_MILE = 1609.34

// Rig profile (Ford F-450 + Soaring Eagle Earie)
const RIG_HEIGHT_M = 3.96   // 13 ft
const RIG_LENGTH_M = 7.62   // 25 ft

// ORS — height/length-aware HGV routing (requires free API key)
const ORS_KEY = import.meta.env.VITE_ORS_API_KEY
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-hgv/geojson'

// OSRM — fallback, no height awareness
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

function toLatLng(coords) {
  return coords.map(([lng, lat]) => [lat, lng])
}

function straightLine(points) {
  return points.map(({ lat, lng }) => [lat, lng])
}

async function fetchORS(points, signal) {
  const res = await fetch(ORS_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: ORS_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
    },
    body: JSON.stringify({
      coordinates: points.map(({ lat, lng }) => [lng, lat]),
      options: {
        vehicle_type: 'hgv',
        profile_params: {
          restrictions: {
            height: RIG_HEIGHT_M,
            length: RIG_LENGTH_M,
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`ORS ${res.status}`)
  const data = await res.json()
  const feature = data.features?.[0]
  const coords = feature?.geometry?.coordinates
  return {
    polyline: coords?.length ? toLatLng(coords) : null,
    distanceMiles: feature?.properties?.summary?.distance
      ? Math.round(feature.properties.summary.distance / METERS_PER_MILE)
      : null,
    durationHours: feature?.properties?.summary?.duration
      ? Math.round((feature.properties.summary.duration / 3600) * 10) / 10
      : null,
  }
}

async function fetchOSRM(points, signal) {
  const coords = points.map(({ lat, lng }) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=simplified&geometries=geojson&annotations=false`
  const res = await fetch(url, { signal })
  const data = await res.json()
  const route0 = data?.routes?.[0]
  const rawCoords = route0?.geometry?.coordinates
  return {
    polyline: rawCoords?.length ? toLatLng(rawCoords) : null,
    distanceMiles: route0?.distance ? Math.round(route0.distance / METERS_PER_MILE) : null,
    durationHours: route0?.duration ? Math.round((route0.duration / 3600) * 10) / 10 : null,
  }
}

export const orsEnabled = Boolean(ORS_KEY && ORS_KEY !== 'your_key_here')

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

    const fetch_ = orsEnabled
      ? fetchORS(points, controller.signal)
      : fetchOSRM(points, controller.signal)

    fetch_
      .then(({ polyline: pl, distanceMiles, durationHours }) => {
        setPolyline(pl ?? straightLine(points))
        setRouteDistanceMiles(distanceMiles)
        setRouteDurationHours(durationHours)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        // ORS failed — try OSRM as last resort
        if (orsEnabled) {
          fetchOSRM(points, controller.signal)
            .then(({ polyline: pl, distanceMiles, durationHours }) => {
              setPolyline(pl ?? straightLine(points))
              setRouteDistanceMiles(distanceMiles)
              setRouteDurationHours(durationHours)
            })
            .catch(() => setPolyline(straightLine(points)))
        } else {
          setPolyline(straightLine(points))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  return { polyline, routeLoading, routeDistanceMiles, routeDurationHours }
}
