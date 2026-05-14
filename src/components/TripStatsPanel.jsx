import { useState } from 'react'

const MPG = 7
const AGENCY_COLORS = {
  TT: '#F57C00', Encore: '#0288D1', USFS: '#006064',
  USACE: '#817717', BLM: '#FBC02D', NPS: '#795548', FWS: '#0097A7',
}

export default function TripStatsPanel({ routeDistanceMiles, routeDurationHours, itinerary, route }) {
  const [fuelPrice, setFuelPrice] = useState(4.00)

  if (!route.startLocation || !route.endLocation) return null

  const { stops } = itinerary
  const totalPlannedNights = stops.reduce((s, st) => s + st.nights, 0)
  const drivingLegs = stops.length + 1  // start→stop1, stop1→stop2…, lastStop→end

  const nightsByType = {}
  for (const st of stops) {
    const t = st.campground.agency_type
    nightsByType[t] = (nightsByType[t] ?? 0) + st.nights
  }

  const totalFuel = routeDistanceMiles
    ? Math.round(routeDistanceMiles / MPG * fuelPrice)
    : null

  return (
    <section className="panel-section stats-panel">
      <h3 className="section-title">Trip Stats</h3>

      <div className="stats-grid">
        {routeDistanceMiles && (
          <div className="stat-item">
            <span className="stat-value">{routeDistanceMiles.toLocaleString()}</span>
            <span className="stat-label">total miles</span>
          </div>
        )}
        {routeDurationHours && (
          <div className="stat-item">
            <span className="stat-value">{routeDurationHours}h</span>
            <span className="stat-label">drive time</span>
          </div>
        )}
        {totalPlannedNights > 0 && (
          <div className="stat-item">
            <span className="stat-value">{totalPlannedNights}</span>
            <span className="stat-label">nights planned</span>
          </div>
        )}
        {stops.length > 0 && (
          <div className="stat-item">
            <span className="stat-value">{stops.length}</span>
            <span className="stat-label">stops</span>
          </div>
        )}
      </div>

      {totalFuel !== null && (
        <div className="fuel-row">
          <span className="fuel-label">Est. fuel</span>
          <span className="fuel-value">${totalFuel.toLocaleString()}</span>
          <span className="fuel-hint">at</span>
          <span className="fuel-price-wrap">
            $<input
              className="fuel-price-input"
              type="number"
              min="2"
              max="8"
              step="0.10"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 4)}
            />/gal
          </span>
          <span className="fuel-hint">· {Math.round(routeDistanceMiles / MPG)} gal · {MPG}MPG</span>
        </div>
      )}

      {Object.keys(nightsByType).length > 0 && (
        <div className="nights-breakdown">
          {Object.entries(nightsByType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, nights]) => (
              <div key={type} className="nights-bar-row">
                <span
                  className="nights-bar-label"
                  style={{ color: AGENCY_COLORS[type] ?? '#607d8b' }}
                >{type}</span>
                <div className="nights-bar-track">
                  <div
                    className="nights-bar-fill"
                    style={{
                      width: `${Math.round(nights / totalPlannedNights * 100)}%`,
                      background: AGENCY_COLORS[type] ?? '#607d8b',
                    }}
                  />
                </div>
                <span className="nights-bar-count">{nights}n</span>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
