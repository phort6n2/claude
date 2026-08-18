'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, MapPin, Plus, Sparkles, X } from 'lucide-react'

/**
 * Which towns this shop covers — and therefore which location pages exist.
 *
 * The list lived only on the Business tab, as a bare text field, while the
 * pages it builds are edited here. A shop set up without it (the import found
 * no towns on their old site, or there was no old site) got no location pages
 * and nothing anywhere said so — the editor below simply listed the one city
 * the shop is in.
 *
 * Order is not cosmetic: the site builds a page for the first few only, so
 * the badge says which of these are pages and which are coverage-band text.
 */

const PAGE_LIMIT = 5

interface Candidate {
  city: string
  miles: number | null
  verified: boolean
}

export default function ServiceAreaPlanner({
  clientId,
  serviceAreas,
}: {
  clientId: string
  serviceAreas: string[]
}) {
  const router = useRouter()
  const [areas, setAreas] = useState<string[]>(serviceAreas)
  /** The cities that actually get a page, straight from the router's own list. */
  const [paged, setPaged] = useState<Set<string>>(new Set())
  const [typed, setTyped] = useState('')
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadPages = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/city-content`)).json()
      setPaged(
        new Set(
          ((data.cities || []) as Array<{ city: string }>).map((c) => c.city.trim().toLowerCase())
        )
      )
    } catch {
      setPaged(new Set())
    }
  }, [clientId])

  useEffect(() => {
    loadPages()
  }, [loadPages])

  async function save(next: string[]) {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAreas: next }),
      })
      if (!res.ok) throw new Error('Could not save the service areas.')
      setAreas(next)
      await loadPages()
      // The editor below is built from this list, and so is the live site.
      router.refresh()
      setMessage({ ok: true, text: 'Saved. The site updates within about 5 minutes.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const add = (cities: string[]) => {
    const have = new Set(areas.map((a) => a.trim().toLowerCase()))
    const fresh = cities.map((c) => c.trim()).filter((c) => c && !have.has(c.toLowerCase()))
    if (!fresh.length) return
    void save([...areas, ...fresh])
  }

  async function suggest() {
    setSuggesting(true)
    setMessage(null)
    setCandidates(null)
    setNote(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/suggest-areas`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not suggest cities.')
      setCandidates(data.candidates || [])
      setNote(data.note || null)
      // Pre-ticked up to the page limit: the common case is "yes, those five".
      setPicked(
        new Set(
          ((data.candidates || []) as Candidate[])
            .slice(0, Math.max(0, PAGE_LIMIT - areas.length))
            .map((c) => c.city)
        )
      )
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not suggest cities.' })
    } finally {
      setSuggesting(false)
    }
  }

  const toggle = (city: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(city)) next.delete(city)
      else next.add(city)
      return next
    })

  return (
    <div className="px-6 pb-5 space-y-4 border-b border-gray-100">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {areas.length === 0 && (
            <span className="text-sm text-gray-500">
              No service areas yet — the site has one page, for the city the shop is in.
            </span>
          )}
          {areas.map((area) => {
            const hasPage = paged.has(area.trim().toLowerCase())
            return (
              <span
                key={area}
                className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-sm border ${
                  hasPage
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}
              >
                {hasPage && <MapPin className="h-3.5 w-3.5" />}
                {area}
                <button
                  type="button"
                  onClick={() => save(areas.filter((a) => a !== area))}
                  disabled={saving}
                  aria-label={`Remove ${area}`}
                  className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The first {PAGE_LIMIT} cities get their own page (marked). The rest appear in the
          coverage band and the footer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add([typed])
              setTyped('')
            }
          }}
          placeholder="Add a city"
          className="px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => {
            add([typed])
            setTyped('')
          }}
          disabled={saving || !typed.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting || saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Suggest nearby cities
        </button>
      </div>

      {candidates && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          {note && <p className="text-xs text-gray-500">{note}</p>}
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-600">Nothing came back that is not already listed.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {candidates.map((c) => (
                  <label
                    key={c.city}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer ${
                      picked.has(c.city)
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-white border-gray-200 text-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(c.city)}
                      onChange={() => toggle(c.city)}
                      className="h-4 w-4"
                    />
                    {c.city}
                    {c.miles !== null && <span className="text-xs text-gray-500">{c.miles} mi</span>}
                    {!c.verified && <span className="text-xs text-amber-700">unverified</span>}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  add([...picked])
                  setCandidates(null)
                  setPicked(new Set())
                }}
                disabled={saving || picked.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Add {picked.size} {picked.size === 1 ? 'city' : 'cities'}
              </button>
              {/* Coverage is a business fact, so it is ticked by a person even
                  when every name checked out on the map. A town twenty minutes
                  away across a river they never cross looks exactly like one
                  they serve daily. */}
              <p className="text-xs text-gray-500">
                Add only towns this shop actually covers — being nearby is not the same as being
                served.
              </p>
            </>
          )}
        </div>
      )}

      {message && (
        <p className={`text-sm flex items-start gap-1.5 ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
          {message.ok ? (
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      )}
    </div>
  )
}
