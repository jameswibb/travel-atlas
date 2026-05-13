import { useState } from 'react'
import CampMap from './components/CampMap.jsx'
import RouteForm from './components/RouteForm.jsx'
import FilterBar from './components/FilterBar.jsx'
import ItineraryPanel from './components/ItineraryPanel.jsx'
import { useCampgrounds } from './hooks/useCampgrounds.js'
import { useItinerary } from './hooks/useItinerary.js'
import { useSavedRoutes } from './hooks/useSavedRoutes.js'
import './App.css'

const DEFAULT_ROUTE = {
  startLocation: null,
  endLocation: null,
  waypoints: [],
  tripStartDate: null,
  tripEndDate: null,
}

const DEFAULT_FILTERS = {
  corridorMiles: 25,
  hookupTypes: [],
  showFCFS: true,
  showReservable: true,
}

export default function App() {
  const [route, setRoute] = useState(DEFAULT_ROUTE)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const { campgrounds, loading } = useCampgrounds()
  const { itinerary, dispatch } = useItinerary()
  const { saved, saveRoute, deleteRoute } = useSavedRoutes()

  function handleLoadRoute(saved) {
    setRoute(saved.route)
    dispatch({ type: 'LOAD', stops: saved.itinerary.stops })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🗺</span>
          <span className="logo-text">Travel Atlas</span>
          {loading && <span className="loading-badge">loading…</span>}
        </div>

        <RouteForm route={route} setRoute={setRoute} />
        <FilterBar filters={filters} setFilters={setFilters} />
        <ItineraryPanel
          itinerary={itinerary}
          dispatch={dispatch}
          route={route}
          saved={saved}
          saveRoute={saveRoute}
          deleteRoute={deleteRoute}
          onLoadRoute={handleLoadRoute}
        />
      </aside>

      <main className="map-area">
        <CampMap
          campgrounds={campgrounds}
          route={route}
          filters={filters}
          itinerary={itinerary}
          dispatch={dispatch}
        />
      </main>
    </div>
  )
}
