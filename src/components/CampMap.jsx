import { useMemo, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon } from 'leaflet'
import { filterCorridor } from '../corridorFilter.js'
import { nearestPark, genieScore } from '../utils/scorer.js'
import 'leaflet/dist/leaflet.css'

const EAST_COAST_CENTER = [37.5, -77.0]
const DEFAULT_ZOOM = 6

// Exact hex colors from the EDDIE Google My Maps KML layer styles
const AGENCY_COLORS = {
  TT:    '#F57C00',  // icon-1859-F57C00 (orange)
  Encore:'#0288D1',  // icon-1597-0288D1 (blue)
  USFS:  '#006064',  // icon-1720-006064 (dark teal)
  USACE: '#817717',  // icon-1502-817717 (olive)
  BLM:   '#FBC02D',  // icon-1869-FBC02D (yellow)
  NPS:   '#795548',  // icon-1776-795548 (brown)
  FWS:   '#0097A7',  // icon-1573-0097A7 (teal)
}

const AGENCY_LABEL = { TT:'TT', Encore:'EN', USFS:'FS', USACE:'CE', BLM:'BL', NPS:'NP', FWS:'FW' }

// SVG teardrop pin — matches the classic Google Maps / My Maps pin shape
function makePinIcon(agencyType, inItinerary) {
  const color = AGENCY_COLORS[agencyType] ?? '#607d8b'
  const label = AGENCY_LABEL[agencyType] ?? '?'
  const w = 28, h = 38
  const cx = w / 2, cy = w / 2 + 2

  // Teardrop path: circle top, pointed bottom
  const r = w / 2 - 1
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <filter id="sh" x="-20%" y="-10%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.35"/>
      </filter>
      <path
        d="M${cx},${h - 2} C${cx},${h - 2} 2,${cy + r * 0.6} 2,${cy} A${r},${r} 0 1,1 ${w - 2},${cy} C${w - 2},${cy + r * 0.6} ${cx},${h - 2} ${cx},${h - 2}Z"
        fill="${color}"
        stroke="white"
        stroke-width="${inItinerary ? 2.5 : 1.5}"
        filter="url(#sh)"
      />
      <circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="white" opacity="0.92"/>
      <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="system-ui,sans-serif"
            font-size="7.5" font-weight="700" fill="${color}">${label}</text>
    </svg>`

  return divIcon({
    className: '',
    html: svg.trim(),
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
  })
}

function RouteFitter({ polyline }) {
  const map = useMap()
  // Key on endpoints only — not the full OSRM geometry (could be 1000+ points)
  const key = polyline.length >= 2
    ? `${polyline[0].join(',')}_${polyline[polyline.length - 1].join(',')}`
    : ''
  useEffect(() => {
    if (polyline.length >= 2) {
      map.fitBounds(polyline, { padding: [60, 60], animate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

const HOOKUP_LABELS = { full: 'Full hookups', electric: 'Electric', water: 'Water', sewer: 'Sewer', none: 'Dry camping' }

function ScoreDots({ score }) {
  return (
    <span className="genie-score-dots">
      {'●'.repeat(score)}{'○'.repeat(5 - score)}
    </span>
  )
}

function SitePopup({ site, inItinerary, onAdd }) {
  const np = nearestPark(site)
  const score = genieScore(site)

  return (
    <div className="site-popup">
      <div className="site-popup-header">
        <span className={`agency-badge agency-${site.agency_type.toLowerCase()}`}>
          {site.agency_type}
        </span>
        {site.access_pass_discount && (
          <span className="badge badge-pass">50% Pass</span>
        )}
        {!site.is_reservable && (
          <span className="badge badge-fcfs">FCFS</span>
        )}
        {np.miles <= 50 && (
          <span className="badge badge-np" title={`${np.park.name} — ${np.miles}mi`}>NP</span>
        )}
      </div>
      <div className="site-popup-name">{site.name}</div>

      <div className="site-popup-details">
        <div className="site-detail-row">
          <span className="detail-label">Score</span>
          <ScoreDots score={score} />
        </div>
        <div className="site-detail-row">
          <span className="detail-label">Hookups</span>
          <span>{site.hookup_types.map((h) => HOOKUP_LABELS[h] ?? h).join(', ')}</span>
        </div>
        {site.amp_available && (
          <div className="site-detail-row">
            <span className="detail-label">Amps</span>
            <span>{site.amp_available}</span>
          </div>
        )}
        {site.stay_limit_nights && (
          <div className="site-detail-row">
            <span className="detail-label">Stay limit</span>
            <span>{site.stay_limit_nights} nights</span>
          </div>
        )}
        {site.max_rig_length_ft && (
          <div className="site-detail-row">
            <span className="detail-label">Max rig</span>
            <span>{site.max_rig_length_ft} ft</span>
          </div>
        )}
        {site.height_clearance_ft && (
          <div className="site-detail-row">
            <span className="detail-label">Clearance</span>
            <span>{site.height_clearance_ft} ft</span>
          </div>
        )}
        {np.miles <= 50 && (
          <div className="site-detail-row">
            <span className="detail-label">Near NP</span>
            <span>{np.park.name} ({np.miles}mi)</span>
          </div>
        )}
        {site.distanceMiles != null && (
          <div className="site-detail-row">
            <span className="detail-label">From route</span>
            <span>{site.distanceMiles} mi</span>
          </div>
        )}
      </div>

      <div className="site-popup-actions">
        {site.booking_url && (
          <a className="popup-book-link" href={site.booking_url} target="_blank" rel="noreferrer">
            Reserve ↗
          </a>
        )}
        {inItinerary ? (
          <span className="popup-added">✓ In itinerary</span>
        ) : (
          <button className="popup-add-btn" onClick={onAdd}>
            + Add to itinerary
          </button>
        )}
      </div>
    </div>
  )
}

export default function CampMap({ campgrounds, polyline, filters, itinerary, dispatch, route }) {

  const visibleSites = useMemo(() => {
    if (polyline.length < 2) return []
    let sites = filterCorridor(campgrounds, polyline, filters.corridorMiles)
    if (filters.hookupTypes.length > 0) {
      sites = sites.filter((s) => s.hookup_types.some((h) => filters.hookupTypes.includes(h)))
    }
    if (!filters.showFCFS) sites = sites.filter((s) => s.is_reservable)
    if (!filters.showReservable) sites = sites.filter((s) => !s.is_reservable)
    return sites
  }, [campgrounds, polyline, filters])

  const itinerarySiteIds = useMemo(
    () => new Set(itinerary.stops.map((s) => s.campground.site_id)),
    [itinerary.stops],
  )

  const handleAdd = useCallback((site) => {
    dispatch({ type: 'ADD_STOP', campground: site, tripStartDate: route.tripStartDate })
  }, [dispatch, route.tripStartDate])

  return (
    <MapContainer center={EAST_COAST_CENTER} zoom={DEFAULT_ZOOM} style={{ flex: 1, height: '100%' }}>
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
        {visibleSites.map((site) => {
          const inItinerary = itinerarySiteIds.has(site.site_id)
          return (
            <Marker
              key={site.site_id}
              position={[site.lat, site.lng]}
              icon={makePinIcon(site.agency_type, inItinerary)}
            >
              <Popup minWidth={220} maxWidth={280}>
                <SitePopup
                  site={site}
                  inItinerary={inItinerary}
                  onAdd={() => handleAdd(site)}
                />
              </Popup>
            </Marker>
          )
        })}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
