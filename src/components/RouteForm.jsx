import LocationSearch from './LocationSearch.jsx'

export default function RouteForm({ route, setRoute }) {
  function set(key) {
    return (val) => setRoute((r) => ({ ...r, [key]: val }))
  }

  function addWaypoint() {
    setRoute((r) => ({ ...r, waypoints: [...(r.waypoints ?? []), null] }))
  }

  function setWaypoint(i, val) {
    setRoute((r) => {
      const wps = [...(r.waypoints ?? [])]
      wps[i] = val
      return { ...r, waypoints: wps }
    })
  }

  function removeWaypoint(i) {
    setRoute((r) => {
      const wps = [...(r.waypoints ?? [])]
      wps.splice(i, 1)
      return { ...r, waypoints: wps }
    })
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

      {(route.waypoints ?? []).map((wp, i) => (
        <div key={i} className="waypoint-row">
          <div className="waypoint-search">
            <LocationSearch
              label={`Via ${i + 1}`}
              value={wp}
              onChange={(val) => setWaypoint(i, val)}
              placeholder="Via city or landmark…"
            />
          </div>
          <button className="remove-waypoint-btn" onClick={() => removeWaypoint(i)} title="Remove">×</button>
        </div>
      ))}

      <button className="add-waypoint-btn" onClick={addWaypoint}>+ Add via stop</button>

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
