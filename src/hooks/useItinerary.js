import { useReducer } from 'react'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function nightsBetween(arrive, depart) {
  const a = new Date(arrive + 'T00:00:00Z')
  const d = new Date(depart + 'T00:00:00Z')
  return Math.max(0, Math.round((d - a) / 86_400_000))
}

function makeStop(campground, arriveDate, nights = 2) {
  return {
    stopId: crypto.randomUUID(),
    campground,
    arriveDate,
    departDate: addDays(arriveDate, nights),
    nights,
    notes: '',
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_STOP': {
      const lastStop = state.stops.at(-1)
      const arriveDate = lastStop
        ? lastStop.departDate
        : (action.tripStartDate ?? new Date().toISOString().slice(0, 10))
      const stop = makeStop(action.campground, arriveDate)
      return { stops: [...state.stops, stop] }
    }

    case 'REMOVE_STOP': {
      const idx = state.stops.findIndex((s) => s.stopId === action.stopId)
      if (idx === -1) return state
      const next = state.stops.filter((s) => s.stopId !== action.stopId)
      // Re-chain dates for stops after the removed one
      for (let i = idx; i < next.length; i++) {
        const prev = next[i - 1]
        if (prev) next[i] = { ...next[i], arriveDate: prev.departDate, departDate: addDays(prev.departDate, next[i].nights) }
      }
      return { stops: next }
    }

    case 'SET_NIGHTS': {
      const idx = state.stops.findIndex((s) => s.stopId === action.stopId)
      if (idx === -1) return state
      const nights = Math.max(1, action.nights)
      const updated = [...state.stops]
      updated[idx] = {
        ...updated[idx],
        nights,
        departDate: addDays(updated[idx].arriveDate, nights),
      }
      // Re-chain subsequent stops
      for (let i = idx + 1; i < updated.length; i++) {
        updated[i] = {
          ...updated[i],
          arriveDate: updated[i - 1].departDate,
          departDate: addDays(updated[i - 1].departDate, updated[i].nights),
        }
      }
      return { stops: updated }
    }

    case 'SET_ARRIVE_DATE': {
      const idx = state.stops.findIndex((s) => s.stopId === action.stopId)
      if (idx === -1) return state
      const updated = [...state.stops]
      updated[idx] = {
        ...updated[idx],
        arriveDate: action.date,
        departDate: addDays(action.date, updated[idx].nights),
      }
      for (let i = idx + 1; i < updated.length; i++) {
        updated[i] = {
          ...updated[i],
          arriveDate: updated[i - 1].departDate,
          departDate: addDays(updated[i - 1].departDate, updated[i].nights),
        }
      }
      return { stops: updated }
    }

    case 'SET_NOTES': {
      return {
        stops: state.stops.map((s) =>
          s.stopId === action.stopId ? { ...s, notes: action.notes } : s,
        ),
      }
    }

    case 'REORDER': {
      const { fromIdx, toIdx } = action
      if (fromIdx === toIdx) return state
      const arr = [...state.stops]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      // Re-chain all dates
      const firstArrive = arr[0]?.arriveDate
      for (let i = 0; i < arr.length; i++) {
        const arrive = i === 0 ? firstArrive : arr[i - 1].departDate
        arr[i] = { ...arr[i], arriveDate: arrive, departDate: addDays(arrive, arr[i].nights) }
      }
      return { stops: arr }
    }

    case 'LOAD': {
      return { stops: action.stops }
    }

    case 'SWAP_STOP': {
      return {
        stops: state.stops.map((s) =>
          s.stopId === action.stopId ? { ...s, campground: action.campground } : s,
        ),
      }
    }

    case 'LOAD_SUGGESTIONS': {
      if (!action.campgrounds?.length) return state
      const baseDate = action.tripStartDate ?? new Date().toISOString().slice(0, 10)
      const existing = state.stops
      const newStops = []
      for (const cg of action.campgrounds) {
        const prev = newStops.at(-1) ?? existing.at(-1)
        const arrive = prev ? prev.departDate : baseDate
        newStops.push(makeStop(cg, arrive))
      }
      return { stops: [...existing, ...newStops] }
    }

    case 'CLEAR': {
      return { stops: [] }
    }

    default:
      return state
  }
}

export function useItinerary() {
  const [state, dispatch] = useReducer(reducer, { stops: [] })
  return { itinerary: state, dispatch }
}

export { nightsBetween }
