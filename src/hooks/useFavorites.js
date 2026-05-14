import { useState, useCallback } from 'react'

const KEY = 'TRAVEL_ATLAS_V1_FAVORITES'

function load() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')) }
  catch { return new Set() }
}

function persist(set) {
  localStorage.setItem(KEY, JSON.stringify([...set]))
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(load)

  const toggle = useCallback((siteId) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(siteId) ? next.delete(siteId) : next.add(siteId)
      persist(next)
      return next
    })
  }, [])

  return { favorites, toggle }
}
