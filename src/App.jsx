import { useState } from 'react'
import CampMap from './components/CampMap.jsx'
import RouteForm from './components/RouteForm.jsx'
import FilterBar from './components/FilterBar.jsx'
import ItineraryPanel from './components/ItineraryPanel.jsx'
import NightCoverageIndicator from './components/NightCoverageIndicator.jsx'
import TripStatsPanel from './components/TripStatsPanel.jsx'
import { useCampgrounds } from './hooks/useCampgrounds.js'
import { useItinerary } from './hooks/useItinerary.js'
import { useSavedRoutes } from './hooks/useSavedRoutes.js'
import { useNightCoverage } from './hooks/useNightCoverage.js'
import { useRoutePolyline } from './hooks/useRoutePolyline.js'
import { useFavorites } from './hooks/useFavorites.js'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { campgrounds, loading } = useCampgrounds()
  const { itinerary, dispatch } = useItinerary()
  const { saved, saveRoute, deleteRoute } = useSavedRoutes()
  const coverage = useNightCoverage(itinerary, route.tripStartDate, route.tripEndDate)
  const { polyline, routeLoading, routeDistanceMiles, routeDurationHours } = useRoutePolyline(route)
  const { favorites, toggle: toggleFavorite } = useFavorites()

  function handleLoadRoute(saved) {
    setRoute(saved.route)
    dispatch({ type: 'LOAD', stops: saved.itinerary.stops })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">🗺</span>
          <span className="logo-text">Travel Atlas</span>
          {loading && <span className="loading-badge">loading…</span>}
          {routeLoading && <span className="loading-badge">routing…</span>}
          <button className="close-sidebar-btn" onClick={() => setSidebarOpen(false)} aria-label="Close">✕</button>
        </div>

        <RouteForm route={route} setRoute={setRoute} />
        <FilterBar filters={filters} setFilters={setFilters} />
        <TripStatsPanel
          routeDistanceMiles={routeDistanceMiles}
          routeDurationHours={routeDurationHours}
          itinerary={itinerary}
          route={route}
        />
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
          favorites={favorites}
          saved={saved}
          saveRoute={saveRoute}
          deleteRoute={deleteRoute}
          onLoadRoute={handleLoadRoute}
        />
      </aside>

      <main className="map-area">
        <button className="open-sidebar-btn" onClick={() => setSidebarOpen(true)}>☰ Plan</button>
        <CampMap
          campgrounds={campgrounds}
          polyline={polyline}
          filters={filters}
          itinerary={itinerary}
          dispatch={dispatch}
          route={route}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
        />
      </main>
    </div>
  )
}
