import { useState, useMemo } from 'react'
import { checkCompliance } from '../complianceEngine.js'
import { nightsBetween } from '../hooks/useItinerary.js'
import { haversine } from '../corridorFilter.js'
import { suggestStops } from '../hooks/useGenieStops.js'
import { nearestPark, genieScore, genieScoreRaw } from '../utils/scorer.js'

const MAX_DRIVE_MILES = 240

const AGENCY_LABEL = {
  TT: 'TT', Encore: 'Encore', USFS: 'USFS', USACE: 'USACE',
  BLM: 'BLM', NPS: 'NPS', FWS: 'FWS',
}

const HOOKUP_SHORT = { full: 'Full', electric: 'Electric', water: 'Water', none: 'Dry' }

function toComplianceStop(s) {
  return {
    site_id: s.campground.site_id,
    agency_type: s.campground.agency_type,
    is_encore: s.campground.is_encore,
    tt_zone: s.campground.tt_zone,
    arrive_date: s.arriveDate,
    depart_date: s.departDate,
  }
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function ScoreDots({ score }) {
  return <span className="genie-score-dots">{'●'.repeat(score)}{'○'.repeat(5 - score)}</span>
}

function AlternativesPanel({ stop, campgrounds, itinerarySiteIds, onSwap }) {
  const alts = useMemo(() => {
    const pos = [stop.campground.lat, stop.campground.lng]
    return campgrounds
      .filter((c) => c.site_id !== stop.campground.site_id && !itinerarySiteIds.has(c.site_id))
      .map((c) => ({ c, dist: haversine(pos, [c.lat, c.lng]) }))
      .filter(({ dist }) => dist <= 40)
      .map(({ c, dist }) => ({ ...c, _dist: dist, _score: genieScoreRaw(c) }))
      .sort((a, b) => b._score - a._score || a._dist - b._dist)
      .slice(0, 3)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.campground.site_id, campgrounds])

  if (!alts.length) return <div className="no-alts">No alternatives within 40mi</div>

  return (
    <div className="alternatives-panel">
      {alts.map((alt) => (
        <div key={alt.site_id} className="alt-row">
          <span className={`agency-badge agency-${alt.agency_type.toLowerCase()}`}>
            {AGENCY_LABEL[alt.agency_type] ?? alt.agency_type}
          </span>
          <div className="alt-info">
            <div className="alt-name">{alt.name}</div>
            <div className="alt-meta">
              {alt.hookup_types.map((h) => HOOKUP_SHORT[h] ?? h).join(', ')}
              {' · '}{Math.round(alt._dist)}mi
              {' · '}<ScoreDots score={genieScore(alt)} />
            </div>
          </div>
          <button className="alt-use-btn" onClick={() => onSwap(alt)}>Use</button>
        </div>
      ))}
    </div>
  )
}

export default function ItineraryPanel({
  itinerary, dispatch, route, polyline, campgrounds,
  favorites, saved, saveRoute, deleteRoute, onLoadRoute,
}) {
  const { stops } = itinerary
  const [expandedNotes, setExpandedNotes] = useState(new Set())
  const [expandedAlts, setExpandedAlts] = useState(null)
  const [generating, setGenerating] = useState(false)

  const complianceStops = stops.map(toComplianceStop)
  const violations = stops.length ? checkCompliance(complianceStops) : []
  const violationByIndex = Object.fromEntries(violations.map((v) => [v.stop_index, v]))

  const itinerarySiteIds = useMemo(
    () => new Set(stops.map((s) => s.campground.site_id)),
    [stops],
  )

  const nightGaps = []
  for (let i = 0; i < stops.length - 1; i++) {
    const gap = nightsBetween(stops[i].departDate, stops[i + 1].arriveDate)
    if (gap > 0) nightGaps.push({ before: i, nights: gap })
  }

  const driveWarnings = []
  for (let i = 0; i < stops.length - 1; i++) {
    const mi = Math.round(haversine(
      [stops[i].campground.lat, stops[i].campground.lng],
      [stops[i + 1].campground.lat, stops[i + 1].campground.lng],
    ))
    if (mi > MAX_DRIVE_MILES) driveWarnings.push({ before: i, miles: mi })
  }

  function toggleNotes(stopId) {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      next.has(stopId) ? next.delete(stopId) : next.add(stopId)
      return next
    })
  }

  function toggleAlts(stopId) {
    setExpandedAlts((prev) => (prev === stopId ? null : stopId))
  }

  function handleSave() {
    const name = prompt('Route name:')
    if (!name) return
    saveRoute(name, route, itinerary)
  }

  function handleGenerate() {
    if (stops.length > 0) {
      if (!window.confirm(`Replace ${stops.length} existing stop${stops.length !== 1 ? 's' : ''} with generated stops?`)) return
      dispatch({ type: 'CLEAR' })
    }
    setGenerating(true)
    const suggestions = suggestStops(campgrounds, polyline)
    setGenerating(false)
    if (!suggestions.length) {
      window.alert('No campgrounds found along this route — try widening the corridor filter.')
      return
    }
    dispatch({
      type: 'LOAD_SUGGESTIONS',
      campgrounds: suggestions.map((s) => s.campground),
      tripStartDate: route.tripStartDate,
    })
  }

  function handleSwap(stop, newCampground) {
    dispatch({ type: 'SWAP_STOP', stopId: stop.stopId, campground: newCampground })
    setExpandedAlts(null)
  }

  const canGenerate = polyline.length >= 2 && campgrounds?.length > 0

  return (
    <section className="panel-section itinerary-section">
      <div className="itinerary-header">
        <h3 className="section-title" style={{ margin: 0 }}>
          Itinerary
          {stops.length > 0 && (
            <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
            </span>
          )}
        </h3>
        <div className="itinerary-actions">
          {canGenerate && (
            <button className="btn-sm btn-genie" onClick={handleGenerate} disabled={generating}
              title="Auto-suggest stops at ~200mi intervals">
              {generating ? '…' : '✦ Generate'}
            </button>
          )}
          {stops.length > 0 && (
            <button className="btn-sm" onClick={handleSave}>Save</button>
          )}
          {stops.length > 0 && (
            <button className="btn-sm btn-ghost" onClick={() => window.print()} title="Print itinerary">⎙</button>
          )}
          {stops.length > 0 && (
            <button className="btn-sm btn-ghost" onClick={() => dispatch({ type: 'CLEAR' })}>Clear</button>
          )}
        </div>
      </div>

      {stops.length === 0 && (
        <p className="empty-hint">
          {canGenerate
            ? 'Click ✦ Generate to auto-fill stops, or click a campground on the map.'
            : 'Enter a route above, then click a campground to add it.'}
        </p>
      )}

      <div className="stop-list">
        {stops.map((stop, i) => {
          const violation = violationByIndex[i]
          const nightGap = nightGaps.find((g) => g.before === i)
          const driveWarn = driveWarnings.find((g) => g.before === i)
          const notesOpen = expandedNotes.has(stop.stopId)
          const altsOpen = expandedAlts === stop.stopId
          const np = nearestPark(stop.campground)
          const score = genieScore(stop.campground)

          return (
            <div key={stop.stopId}>
              <div className={`stop-card ${violation ? 'stop-card-violation' : ''}`}>
                <div className="stop-card-header">
                  <span className={`agency-badge agency-${stop.campground.agency_type.toLowerCase()}`}>
                    {AGENCY_LABEL[stop.campground.agency_type] ?? stop.campground.agency_type}
                  </span>
                  {np.miles <= 50 && (
                    <span className="badge badge-np" title={`${np.park.name} — ${np.miles}mi`}>NP</span>
                  )}
                  <span className="stop-name">{stop.campground.name}</span>
                  <button className="swap-btn" onClick={() => toggleAlts(stop.stopId)} title="Swap campground">
                    {altsOpen ? '▲' : '↕'}
                  </button>
                  <button className="remove-btn" onClick={() => dispatch({ type: 'REMOVE_STOP', stopId: stop.stopId })}
                    title="Remove stop">×</button>
                </div>

                <div className="stop-score-row">
                  <ScoreDots score={score} />
                  {stop.campground.hookup_types?.length > 0 && (
                    <span className="stop-hookup-hint">
                      {stop.campground.hookup_types.map((h) => HOOKUP_SHORT[h] ?? h).join(' · ')}
                    </span>
                  )}
                </div>

                <div className="stop-dates">
                  <div className="field-group-inline">
                    <label className="field-label">Arrive</label>
                    <input type="date" className="date-input" value={stop.arriveDate}
                      onChange={(e) => dispatch({ type: 'SET_ARRIVE_DATE', stopId: stop.stopId, date: e.target.value })}
                    />
                  </div>
                  <div className="nights-control">
                    <button onClick={() => dispatch({ type: 'SET_NIGHTS', stopId: stop.stopId, nights: stop.nights - 1 })}>−</button>
                    <span className="nights-val">{stop.nights}n</span>
                    <button onClick={() => dispatch({ type: 'SET_NIGHTS', stopId: stop.stopId, nights: stop.nights + 1 })}>+</button>
                  </div>
                  <span className="depart-label">→ {formatDate(stop.departDate)}</span>
                </div>

                <div className="stop-links">
                  <a
                    className="stop-link stop-link-nav"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.campground.lat},${stop.campground.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >Navigate ↗</a>
                  {stop.campground.booking_url && (
                    <a className="stop-link" href={stop.campground.booking_url} target="_blank" rel="noreferrer">
                      Reserve ↗
                    </a>
                  )}
                  {favorites?.has(stop.campground.site_id) && (
                    <span className="stop-fav-badge">♥ Saved</span>
                  )}
                </div>

                <button className="notes-toggle" onClick={() => toggleNotes(stop.stopId)}>
                  {notesOpen ? '▲ Notes'
                    : stop.notes ? `▼ Note: ${stop.notes.slice(0, 30)}${stop.notes.length > 30 ? '…' : ''}`
                    : '+ Add note'}
                </button>

                {notesOpen && (
                  <textarea className="stop-notes" placeholder="Notes for this stop…"
                    value={stop.notes}
                    onChange={(e) => dispatch({ type: 'SET_NOTES', stopId: stop.stopId, notes: e.target.value })}
                  />
                )}

                {altsOpen && (
                  <AlternativesPanel
                    stop={stop}
                    campgrounds={campgrounds}
                    itinerarySiteIds={itinerarySiteIds}
                    onSwap={(alt) => handleSwap(stop, alt)}
                  />
                )}

                {stop.nights >= 14 && (stop.campground.agency_type === 'TT' || stop.campground.agency_type === 'Encore') && (
                  <div className="compliance-alert compliance-tt_stay_warning">
                    <strong>⏱ 14-night limit approaching</strong>
                    <p>TT/Encore max stay is 14 nights. Plan your departure.</p>
                  </div>
                )}

                {violation && (
                  <div className={`compliance-alert compliance-${violation.violation_type.toLowerCase()}`}>
                    <strong>
                      {violation.violation_type === 'FULL_SYSTEM_LOCKOUT' && '🔒 Full lockout'}
                      {violation.violation_type === 'ENCORE_LOCKOUT' && '🔒 Encore lockout'}
                      {violation.violation_type === 'TT_ZONE_BLOCKED' && '⛔ Zone blocked'}
                    </strong>
                    <p>{violation.explanation}</p>
                    <p className="earliest">Earliest legal: <strong>{violation.earliest_legal_date}</strong></p>
                  </div>
                )}
              </div>

              {driveWarn && (
                <div className="leg-warning">
                  🚗 {driveWarn.miles} mi to next stop — over 4-hour drive
                </div>
              )}
              {nightGap && (
                <div className="gap-warning">
                  ⚠ {nightGap.nights} uncovered night{nightGap.nights !== 1 ? 's' : ''} before next stop
                </div>
              )}
            </div>
          )
        })}
      </div>

      {saved.length > 0 && (
        <div className="saved-section">
          <h4 className="saved-title">Saved Routes</h4>
          {saved.map((r) => (
            <div key={r.routeId} className="saved-row">
              <button className="saved-name" onClick={() => onLoadRoute(r)}>{r.name}</button>
              <button className="remove-btn" onClick={() => deleteRoute(r.routeId)}>×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
