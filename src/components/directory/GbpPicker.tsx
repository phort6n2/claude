'use client'

import { useRef, useState } from 'react'
import { Search, Loader2, MapPin } from 'lucide-react'

export interface GbpDetails {
  placeId: string
  name: string
  phone: string
  website: string
  street: string
  city: string
  state: string
  stateFull: string
  zip: string
  formattedAddress: string
  category: string
  serviceAreaOnly: boolean
  verify: { verdict: string; ok: boolean; reason: string }
}

interface Prediction {
  placeId: string
  primary: string
  secondary: string
}

export function GbpPicker({ onSelect }: { onSelect: (d: GbpDetails) => void }) {
  const [q, setQ] = useState('')
  const [preds, setPreds] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [searched, setSearched] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(v: string) {
    setQ(v)
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 3) {
      setPreds([])
      setSearched(false)
      return
    }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/directory/places/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: v }),
        })
        const j = await res.json()
        setPreds(j.predictions ?? [])
      } catch {
        setPreds([])
      } finally {
        setLoading(false)
        setSearched(true)
      }
    }, 300)
  }

  async function pick(p: Prediction) {
    setPicking(true)
    setOpen(false)
    setQ(p.primary)
    try {
      const res = await fetch('/api/directory/places/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: p.placeId }),
      })
      if (res.ok) onSelect(await res.json())
    } catch {
      /* fall back to manual entry */
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="gbp-search">
        Find your business on Google
      </label>
      <div className="relative">
        <Search
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          id="gbp-search"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => preds.length && setOpen(true)}
          placeholder="Start typing your shop name…"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
        />
        {(loading || picking) && (
          <Loader2
            width={16}
            height={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
          />
        )}
      </div>

      {open && q.trim().length >= 3 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {preds.map((p) => (
            <button
              key={p.placeId}
              type="button"
              onClick={() => pick(p)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50"
            >
              <MapPin width={15} height={15} className="mt-0.5 shrink-0 text-gray-400" />
              <span>
                <span className="font-medium text-gray-900">{p.primary}</span>
                {p.secondary && <span className="block text-xs text-gray-500">{p.secondary}</span>}
              </span>
            </button>
          ))}
          {searched && !loading && preds.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-gray-500">
              No match found — no problem, just fill in your details below.
            </p>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-gray-500">
        Picking your Google profile autofills your details. Mobile/service-area shops work too — or
        skip this and enter everything manually.
      </p>
    </div>
  )
}
