function formatDate(d) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export default function NightCoverageIndicator({ coverage, tripStartDate, tripEndDate }) {
  if (!tripStartDate || !tripEndDate) return null
  const { totalTripNights, coveredNights, uncoveredDates, isFullyCovered } = coverage

  return (
    <div className={`coverage-bar ${isFullyCovered ? 'coverage-ok' : uncoveredDates.length > 0 ? 'coverage-gap' : 'coverage-partial'}`}>
      <div className="coverage-summary">
        <span className="coverage-icon">{isFullyCovered ? '✓' : '⚠'}</span>
        <span className="coverage-text">
          {coveredNights} / {totalTripNights} nights covered
        </span>
        {!isFullyCovered && uncoveredDates.length > 0 && (
          <span className="coverage-gap-count">{uncoveredDates.length} gap{uncoveredDates.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      {uncoveredDates.length > 0 && (
        <div className="coverage-gaps">
          {uncoveredDates.slice(0, 5).map((d) => (
            <span key={d} className="gap-date">{formatDate(d)}</span>
          ))}
          {uncoveredDates.length > 5 && (
            <span className="gap-date gap-more">+{uncoveredDates.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  )
}
