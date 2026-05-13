import { useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon } from 'leaflet'
import { filterCorridor } from '../corridorFilter.js'
import 'leaflet/dist/leaflet.css'

const EAST_COAST_CENTER = [37.5, -77.0]
const DEFAULT_ZOOM = 6

const AGENCY_COLORS = {
  TT: '#ff6b35',
  Encore: '#9c27b0',
  USFS: '#2d6a4f',
  USACE: '#1565c0',
  BLM: '#e65100',
  NPS: '#6a1b9a',
  FWS: '#558b2f',
}

function makeDotIcon(agencyType, inItinerary) {
  const color = AGENCY_COLORS[agencyType] ?? '#607d8b'
  const size = inItinerary ? 14 : 10
  const border = inItinerary ? '2.5px solid white' : '1.5px solid rgba(255,255,255,0.7)'
  const shadow = inItinerary ? '0 0 0 2px ' + color : '0 1px 3px rgba(0,0,0,0.35)'
  return divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border};box-shadow:${shadow};cursor:pointer"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Fly to bounds when route changes
function RouteFitter({ polyline }) {
  const map = useMap()
  useMemo(() => {
    if (polyline.length >= 2) {
      map.fitBounds(polyline, { padding: [60, 60] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyline.map((p) => p.join(',')).join('|')])
  return null
}

export default function CampMap({ campgrounds, route, filters, itinerary, dispatch }) {
  const polyline = useMemo(() => {
    const pts = []
    if (route.startLocation) pts.push([route.startLocation.lat, route.startLocation.lng])
    for (const wp of (route.waypoints ?? [])) pts.push([wp.lat, wp.lng])
    if (route.endLocation) pts.push([route.endLocation.lat, route.endLocation.lng])
    return pts
  }, [route])

  const visibleSites = useMemo(() => {
    if (polyline.length < 2) return []

    let sites = filterCorridor(campgrounds, polyline, filters.corridorMiles)

    // Hookup filter
    if (filters.hookupTypes.length > 0) {
      sites = sites.filter((s) =>
        s.hookup_types.some((h) => filters.hookupTypes.includes(h)),
      )
    }

    // FCFS / Reservable filter
    if (!filters.showFCFS) sites = sites.filter((s) => s.is_reservable)
    if (!filters.showReservable) sites = sites.filter((s) => !s.is_reservable)

    return sites
  }, [campgrounds, polyline, filters])

  const itinerarySiteIds = useMemo(
    () => new Set(itinerary.stops.map((s) => s.campground.site_id)),
    [itinerary.stops],
  )

  function handleMarkerClick(site) {
    if (itinerarySiteIds.has(site.site_id)) return
    dispatch({ type: 'ADD_STOP', campground: site, tripStartDate: route.tripStartDate })
  }

  return (
    <MapContainer
      center={EAST_COAST_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ flex: 1, height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {polyline.length >= 2 && (
        <>
          <Polyline positions={polyline} color="#2196f3" weight={3} opacity={0.75} />
          <RouteFitter polyline={polyline} />
        </>
      )}

      <MarkerClusterGroup chunkedLoading>
        {visibleSites.map((site) => (
          <Marker
            key={site.site_id}
            position={[site.lat, site.lng]}
            icon={makeDotIcon(site.agency_type, itinerarySiteIds.has(site.site_id))}
            eventHandlers={{ click: () => handleMarkerClick(site) }}
          >
            <Tooltip>
              <strong>{site.name}</strong>
              <br />
              {site.agency_type}
              {site.distanceMiles != null && ` · ${site.distanceMiles} mi`}
              {site.is_dog_friendly && ' · 🐾'}
              <br />
              Hookups: {site.hookup_types.join(', ')}
              {site.amp_available && ` · ${site.amp_available}`}
            </Tooltip>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
