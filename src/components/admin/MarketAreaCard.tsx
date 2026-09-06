'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

/**
 * What this shop's HEADLINES call the area it covers.
 *
 * A shop's address is one city; the business it wants is the region. Auto
 * Glass Kings sit in Huntington Beach and work across Orange County, and an
 * H1 saying "Huntington Beach" tells most of the people who land on it that
 * they are on the wrong site.
 *
 * The preview under the field is the whole point of the card. This changes
 * the biggest words on the site, so the operator should be reading the
 * sentence they are about to publish rather than imagining it — the same
 * reason the alert test sends the real message.
 */

const AUTOSAVE_MS = 900

export default function MarketAreaCard({
  clientId,
  city,
  state,
  marketArea,
  offersMobileService,
}: {
  clientId: string
  city: string
  state: string
  marketArea: string | null
  offersMobileService: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(marketArea || '')
  const [saved, setSaved] = useState(marketArea || '')
  const [status, setStatus] = useState<null | 'saving' | 'saved' | 'failed'>(null)
  const [error, setError] = useState('')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (value.trim() === saved.trim()) return
    const timer = setTimeout(async () => {
      setStatus('saving')
      setError('')
      try {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketArea: value.trim() }),
        })
        if (!res.ok) throw new Error(`The server answered ${res.status}`)
        setSaved(value.trim())
        setStatus('saved')
        // The live pages read this, and so does the preview link beside them.
        router.refresh()
      } catch (err) {
        setStatus('failed')
        setError(err instanceof Error ? err.message : 'Could not save.')
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [value, saved, clientId, router])

  const area = value.trim() || city
  const wider = !!value.trim() && value.trim().toLowerCase() !== city.toLowerCase()

  return (
    <div className="p-6 pt-4 space-y-3">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700" htmlFor="market-area">
          Headline area
          {status === 'saving' && (
            <span className="ml-2 text-xs font-normal text-gray-500">Saving…</span>
          )}
          {status === 'saved' && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-green-700">
              <Check size={12} /> Saved — the site updates within about 5 minutes
            </span>
          )}
          {status === 'failed' && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-red-600">
              <AlertCircle size={12} /> {error}
            </span>
          )}
          {status === 'saving' && <Loader2 size={12} className="ml-1 inline animate-spin" />}
        </label>
        <input
          id="market-area"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${city} — the shop's own city`}
          className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500">
          Leave it empty and every headline says <strong>{city}</strong>, which is how the site
          reads today. Set it to the region this shop actually works —{' '}
          <em>Orange County</em>, <em>the Hudson Valley</em>, <em>Denver Metro</em> — and the big
          words on the homepage and the service pages say that instead.
        </p>
      </div>

      {/* The sentences that change, as they will be published. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-gray-400">
          How the site will read
        </p>
        <p className="m-0 text-xs text-gray-500">
          Windshield repair &amp; replacement · {city}, {state}
        </p>
        <p className="m-0 text-base font-extrabold leading-snug text-gray-900">
          {offersMobileService
            ? `Cracked windshield in ${area}? We come to you.`
            : `Windshield repair and replacement in ${area}`}
        </p>
        <p className="m-0 text-xs text-gray-600">
          Service pages: <em>Windshield replacement in {area}</em>
        </p>
        <p className="m-0 text-xs text-gray-600">
          {wider
            ? offersMobileService
              ? `Top bar: Mobile service across ${area} — we come to your home or workplace, from our shop in ${city}`
              : `Top bar: Serving ${area} from our ${city}, ${state} shop`
            : offersMobileService
              ? `Top bar: Mobile service across ${city} & nearby — we come to your home or workplace`
              : `Top bar: Serving ${city}, ${state} and nearby`}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
        <p className="m-0">
          <strong>Only what a headline says changes.</strong> The address, the map, the contact
          card, the location pages and the business schema keep <strong>{city}</strong> — those are
          facts about where the shop is, they are cross-checked against the Google Business
          Profile, and a region in place of a city there is a broken listing rather than a wider
          catchment. The small line above each headline keeps the city too.
        </p>
        <p className="m-0">
          <strong>Only put down an area they really cover.</strong> Nothing here can check it, and
          a shop that gets calls from an hour outside its range loses the job and the review.
        </p>
      </div>
    </div>
  )
}
