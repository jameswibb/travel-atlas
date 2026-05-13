import LocationSearch from './LocationSearch.jsx'

export default function RouteForm({ route, setRoute }) {
  function set(key) {
    return (val) => setRoute((r) => ({ ...r, [key]: val }))
  }

  return (
    <section className="panel-section">
      <h3 className="section-title">Route</h3>
      <LocationSearch
        label="From"
        value={route.startLocation}
        onChange={set('startLocation')}
        placeholder="Starting city…"
      />
      <LocationSearch
        label="To"
        value={route.endLocation}
        onChange={set('endLocation')}
        placeholder="Destination city…"
      />
      <div className="date-row">
        <div className="field-group">
          <label className="field-label">Depart</label>
          <input
            type="date"
            className="date-input"
            value={route.tripStartDate ?? ''}
            onChange={(e) => setRoute((r) => ({ ...r, tripStartDate: e.target.value || null }))}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Return by</label>
          <input
            type="date"
            className="date-input"
            value={route.tripEndDate ?? ''}
            onChange={(e) => setRoute((r) => ({ ...r, tripEndDate: e.target.value || null }))}
          />
        </div>
      </div>
    </section>
  )
}
