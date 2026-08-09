'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

/**
 * Google Business Profile picker.
 *
 * Typing an address by hand is how a shop ends up with a ZIP that doesn't
 * match its city and a Place ID that resolves to the competitor two doors
 * down. Picking the profile fills all of it from Google at once — including
 * the Place ID that the per-shop rating refresh depends on.
 */

export interface PlacePrediction {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

export interface PlaceDetails {
  placeId: string
  businessName: string
  phone: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  googleMapsUrl: string
}

export default function GbpPicker({
  label = 'Find this shop on Google',
  placeholder = 'Start typing the business name or address…',
  onSelect,
}: {
  label?: string
  placeholder?: string
  onSelect: (details: PlaceDetails) => void
}) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when a pick is applied, so the debounce doesn't immediately re-search
  // the name we just filled in.
  const justPicked = useRef(false)

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false
      return
    }
    if (query.trim().length < 3) {
      setPredictions([])
      setOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/integrations/google-places/search?query=${encodeURIComponent(query)}`
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Search failed')
        setPredictions(data.predictions || [])
        setOpen(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setPredictions([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function pick(prediction: PlacePrediction) {
    setOpen(false)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/integrations/google-places/details?placeId=${encodeURIComponent(prediction.placeId)}`
      )
      const details = await res.json()
      if (!res.ok) throw new Error(details.error || 'Could not load that listing')
      justPicked.current = true
      setQuery(details.businessName || prediction.mainText)
      onSelect(details as PlaceDetails)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that listing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Search size={16} className="text-blue-600" />
        <span className="text-sm font-medium text-blue-900">{label}</span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-blue-500" />
        )}
        {open && predictions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg list-none p-0 m-0">
            {predictions.map((prediction) => (
              <li key={prediction.placeId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(prediction)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50"
                >
                  <span className="block text-sm font-medium text-gray-900">
                    {prediction.mainText}
                  </span>
                  <span className="block text-xs text-gray-500">{prediction.secondaryText}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-blue-800">
        Fills the address, phone, hours link, and this shop&apos;s Place ID — which is what the
        per-shop rating refresh reads.
      </p>
    </div>
  )
}
