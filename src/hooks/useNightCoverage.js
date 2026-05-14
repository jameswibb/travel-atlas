import { useMemo } from 'react'

function datesInRange(startStr, endStr) {
  const dates = []
  const cur = new Date(startStr + 'T00:00:00Z')
  const end = new Date(endStr + 'T00:00:00Z')
  while (cur < end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

/**
 * Computes night coverage across the itinerary vs the trip window.
 *
 * @param {{ stops: Array<{arriveDate:string, departDate:string}> }} itinerary
 * @param {string|null} tripStartDate  YYYY-MM-DD
 * @param {string|null} tripEndDate    YYYY-MM-DD
 */
export function useNightCoverage(itinerary, tripStartDate, tripEndDate) {
  return useMemo(() => {
    if (!tripStartDate || !tripEndDate) {
      return { totalTripNights: 0, coveredNights: 0, uncoveredDates: [], isFullyCovered: false }
    }

    const tripDates = new Set(datesInRange(tripStartDate, tripEndDate))
    const totalTripNights = tripDates.size

    const coveredDates = new Set()
    for (const stop of itinerary.stops) {
      for (const d of datesInRange(stop.arriveDate, stop.departDate)) {
        coveredDates.add(d)
      }
    }

    const uncoveredDates = [...tripDates].filter((d) => !coveredDates.has(d)).sort()
    const coveredNights = [...tripDates].filter((d) => coveredDates.has(d)).length

    return {
      totalTripNights,
      coveredNights,
      uncoveredDates,
      isFullyCovered: uncoveredDates.length === 0 && totalTripNights > 0,
    }
  }, [itinerary.stops, tripStartDate, tripEndDate])
}
