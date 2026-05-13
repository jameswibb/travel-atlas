const HOOKUP_OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water' },
  { value: 'none', label: 'Dry' },
]

export default function FilterBar({ filters, setFilters }) {
  function toggleHookup(v) {
    setFilters((f) => {
      const next = f.hookupTypes.includes(v)
        ? f.hookupTypes.filter((x) => x !== v)
        : [...f.hookupTypes, v]
      return { ...f, hookupTypes: next }
    })
  }

  return (
    <section className="panel-section">
      <h3 className="section-title">Filters</h3>

      <div className="field-group">
        <label className="field-label">
          Corridor <span className="muted">{filters.corridorMiles} mi</span>
        </label>
        <input
          type="range"
          min={10}
          max={150}
          step={5}
          value={filters.corridorMiles}
          onChange={(e) => setFilters((f) => ({ ...f, corridorMiles: +e.target.value }))}
          className="slider"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Hookups <span className="muted">(any if none selected)</span></label>
        <div className="chip-row">
          {HOOKUP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              className={`chip ${filters.hookupTypes.includes(value) ? 'chip-on' : ''}`}
              onClick={() => toggleHookup(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="toggle-row">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={filters.showFCFS}
            onChange={(e) => setFilters((f) => ({ ...f, showFCFS: e.target.checked }))}
          />
          First-come / first-served
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={filters.showReservable}
            onChange={(e) => setFilters((f) => ({ ...f, showReservable: e.target.checked }))}
          />
          Reservable
        </label>
      </div>
    </section>
  )
}
