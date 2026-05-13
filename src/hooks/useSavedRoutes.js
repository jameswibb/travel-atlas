import { useState, useCallback } from 'react'

const STORAGE_KEY = 'TRAVEL_ATLAS_V1_ROUTES'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, routes: [] }
    return JSON.parse(raw)
  } catch {
    return { version: 1, routes: [] }
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useSavedRoutes() {
  const [saved, setSaved] = useState(() => load().routes)

  const saveRoute = useCallback((name, route, itinerary) => {
    const entry = {
      routeId: crypto.randomUUID(),
      name,
      savedAt: new Date().toISOString(),
      route,
      itinerary,
    }
    const store = load()
    store.routes = [entry, ...store.routes]
    save(store)
    setSaved(store.routes)
  }, [])

  const deleteRoute = useCallback((routeId) => {
    const store = load()
    store.routes = store.routes.filter((r) => r.routeId !== routeId)
    save(store)
    setSaved(store.routes)
  }, [])

  return { saved, saveRoute, deleteRoute }
}
