import { useState, useEffect, useRef } from 'react'
import { searchLocations } from '../geocode.js'

export default function LocationSearch({ label, value, onChange, placeholder }) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  // Sync external clear
  useEffect(() => {
    if (!value) setQuery('')
  }, [value])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const res = await searchLocations(q)
      setResults(res)
      setOpen(res.length > 0)
    }, 400)
  }

  function select(item) {
    setQuery(item.label.split(',')[0])
    setResults([])
    setOpen(false)
    onChange(item)
  }

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="loc-wrap" ref={wrapRef}>
      {label && <label className="field-label">{label}</label>}
      <input
        className="loc-input"
        value={query}
        onChange={handleInput}
        placeholder={placeholder ?? 'Search location…'}
        autoComplete="off"
      />
      {open && (
        <ul className="loc-dropdown">
          {results.map((r, i) => (
            <li key={i} onMouseDown={() => select(r)}>
              {r.label.split(',').slice(0, 3).join(',')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
