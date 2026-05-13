import { useEffect, useState } from 'react'

/** Hard filters — always on, from rig profile. */
function hardFilter(sites) {
  return sites.filter((s) => {
    if (!s.is_dog_friendly) return false
    if (s.height_clearance_ft !== null && s.height_clearance_ft < 13) return false
    if (s.max_rig_length_ft !== null && s.max_rig_length_ft < 25) return false
    if (s.agency_type === 'TT' && !s.is_encore) {
      if (s.tt_zone !== 'NE' && s.tt_zone !== 'SE') return false
    }
    return true
  })
}

/**
 * Load campgrounds.json once and apply hard filters.
 * Returns { campgrounds, loading, error }
 */
export function useCampgrounds() {
  const [campgrounds, setCampgrounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/campgrounds.json')
      .then((r) => r.json())
      .then((data) => {
        setCampgrounds(hardFilter(data))
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { campgrounds, loading, error }
}
