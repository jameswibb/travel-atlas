import { useState } from 'react'
import CampMap from './components/CampMap.jsx'
import RouteForm from './components/RouteForm.jsx'
import FilterBar from './components/FilterBar.jsx'
import ItineraryPanel from './components/ItineraryPanel.jsx'
import NightCoverageIndicator from './components/NightCoverageIndicator.jsx'
import { useCampgrounds } from './hooks/useCampgrounds.js'
import { useItinerary } from './hooks/useItinerary.js'
import { useSavedRoutes } from './hooks/useSavedRoutes.js'
import { useNightCoverage } from './hooks/useNightCoverage.js'
import { useRoutePolyline } from './hooks/useRoutePolyline.js'
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
  const coverage = useNightCoverage(itinerary, route.tripStartDate, route.tripEndDate)
  const { polyline, routeLoading } = useRoutePolyline(route)

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
          {routeLoading && <span className="loading-badge">routing…</span>}
        </div>

        <RouteForm route={route} setRoute={setRoute} />
        <FilterBar filters={filters} setFilters={setFilters} />
        <NightCoverageIndicator
          coverage={coverage}
          tripStartDate={route.tripStartDate}
          tripEndDate={route.tripEndDate}
        />
        <ItineraryPanel
          itinerary={itinerary}
          dispatch={dispatch}
          route={route}
          polyline={polyline}
          campgrounds={campgrounds}
          saved={saved}
          saveRoute={saveRoute}
          deleteRoute={deleteRoute}
          onLoadRoute={handleLoadRoute}
        />
      </aside>

      <main className="map-area">
        <CampMap
          campgrounds={campgrounds}
          polyline={polyline}
          filters={filters}
          itinerary={itinerary}
          dispatch={dispatch}
          route={route}
        />
      </main>
    </div>
  )
}
