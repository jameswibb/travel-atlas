import { checkCompliance } from '../complianceEngine.js'
import { nightsBetween } from '../hooks/useItinerary.js'

const AGENCY_LABEL = {
  TT: 'TT', Encore: 'Encore', USFS: 'USFS', USACE: 'USACE',
  BLM: 'BLM', NPS: 'NPS', FWS: 'FWS',
}

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

export default function ItineraryPanel({ itinerary, dispatch, route, saved, saveRoute, deleteRoute, onLoadRoute }) {
  const { stops } = itinerary
  const complianceStops = stops.map(toComplianceStop)
  const violations = stops.length ? checkCompliance(complianceStops) : []
  const violationByIndex = Object.fromEntries(violations.map((v) => [v.stop_index, v]))

  // Night coverage gaps
  const gaps = []
  for (let i = 0; i < stops.length - 1; i++) {
    const gap = nightsBetween(stops[i].departDate, stops[i + 1].arriveDate)
    if (gap > 0) gaps.push({ before: i, nights: gap })
  }

  function handleSave() {
    const name = prompt('Route name:')
    if (!name) return
    saveRoute(name, route, itinerary)
  }

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
          {stops.length > 0 && (
            <button className="btn-sm" onClick={handleSave}>Save</button>
          )}
          {stops.length > 0 && (
            <button className="btn-sm btn-ghost" onClick={() => dispatch({ type: 'CLEAR' })}>Clear</button>
          )}
        </div>
      </div>

      {stops.length === 0 && (
        <p className="empty-hint">Click a campground on the map to add it.</p>
      )}

      <div className="stop-list">
        {stops.map((stop, i) => {
          const violation = violationByIndex[i]
          const gap = gaps.find((g) => g.before === i)
          return (
            <div key={stop.stopId}>
              <div className={`stop-card ${violation ? 'stop-card-violation' : ''}`}>
                <div className="stop-card-header">
                  <span className={`agency-badge agency-${stop.campground.agency_type.toLowerCase()}`}>
                    {AGENCY_LABEL[stop.campground.agency_type] ?? stop.campground.agency_type}
                  </span>
                  <span className="stop-name">{stop.campground.name}</span>
                  <button
                    className="remove-btn"
                    onClick={() => dispatch({ type: 'REMOVE_STOP', stopId: stop.stopId })}
                    title="Remove stop"
                  >×</button>
                </div>

                <div className="stop-dates">
                  <div className="field-group-inline">
                    <label className="field-label">Arrive</label>
                    <input
                      type="date"
                      className="date-input"
                      value={stop.arriveDate}
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

                {stop.campground.booking_url && (
                  <a className="booking-link" href={stop.campground.booking_url} target="_blank" rel="noreferrer">
                    Reserve ↗
                  </a>
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

              {gap && (
                <div className="gap-warning">
                  ⚠ {gap.nights} uncovered night{gap.nights !== 1 ? 's' : ''} before next stop
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Saved routes */}
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
