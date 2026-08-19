'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, MapPin, Sparkles, TriangleAlert } from 'lucide-react'
import { locationPath } from '@/lib/site-paths'

/**
 * Per-city copy for the location pages.
 *
 * The problem it solves, measured on a live client: two city pages differed
 * by four lines out of 294. Same services, same warranty, same reviews, with
 * the city name swapped — the textbook description of a doorway page, and
 * Google treats a network of them as an account-level problem.
 *
 * A city below the bar still has a working page (an ad may already point at
 * it, and a 404 there gets the ad disapproved) but it is marked noindex, kept
 * out of the sitemap, and not linked from the site. Writing a few real
 * sentences flips all three.
 */

interface CityRow {
  city: string
  slug: string
  heading: string
  body: string
  wordCount: number
  hasShop: boolean
  indexable: boolean
}

export default function CityContentEditor({
  clientId,
  previewBase,
}: {
  clientId: string
  /**
   * Where these pages can be opened, e.g. `/sites/{slug}`. The app host is
   * used rather than the client's own domain because it serves every client
   * whether or not a domain has been pointed yet — which is exactly when
   * somebody is in here checking the pages.
   */
  previewBase?: string
}) {
  const [cities, setCities] = useState<CityRow[] | null>(null)
  const [minWords, setMinWords] = useState(60)
  const [unavailable, setUnavailable] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/city-content`)).json()
      setCities(data.cities || [])
      setMinWords(data.minWords || 60)
      if (data.unavailable) setUnavailable(true)
    } catch {
      setCities([])
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  const edit = (city: string, patch: Partial<CityRow>) => {
    setCities((prev) =>
      (prev || []).map((row) => (row.city === city ? { ...row, ...patch } : row))
    )
    setMessage(null)
  }

  /**
   * Ask Claude for a draft, and put it in the box — unsaved.
   *
   * It is never written straight to the site: the model knows only what the
   * client record says, and a fluent paragraph about a business is exactly
   * the kind of thing that reads true and isn't.
   */
  async function draft(row: CityRow) {
    setDrafting(row.city)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/city-content/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: row.city }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Draft failed')
      edit(row.city, { heading: data.draft.heading, body: data.draft.body })
      setMessage({
        ok: true,
        text: `Draft ready for ${row.city}. Read it, fix anything that isn't true, then save.`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Draft failed' })
    } finally {
      setDrafting(null)
    }
  }

  async function save(row: CityRow) {
    setSaving(row.city)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/city-content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: row.city, heading: row.heading, body: row.body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      await load()
      setMessage({ ok: true, text: `${row.city} saved.` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSaving(null)
    }
  }

  if (cities === null) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading cities…
      </div>
    )
  }

  const thin = cities.filter((c) => !c.indexable)

  return (
    <div className="p-6 pt-4 space-y-4">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            The city-content table doesn&apos;t exist in this database yet. Run{' '}
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/admin/setup-db', { method: 'POST' }).catch(() => {})
                void load()
              }}
              className="underline underline-offset-2 font-semibold"
            >
              Set the database up now
            </button>{' '}
            — this runs the missing table creation, then reloads.
          </span>
        </div>
      )}

      {cities.length === 0 ? (
        <p className="text-sm text-gray-500">
          No location pages yet — add the cities above and each one gets a page.
        </p>
      ) : (
        <div
          className={`rounded-lg border p-3 text-sm ${
            thin.length === 0
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {thin.length === 0 ? (
            <span className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              Every city page has something specific to say. All are indexed and linked.
            </span>
          ) : (
            <span className="flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>
                  {thin.length} of {cities.length} city pages have nothing city-specific on them.
                </strong>{' '}
                They still work and still take ad traffic, but they carry noindex and aren&apos;t
                linked or in the sitemap — a set of near-identical city pages is what Google calls
                a doorway, and the penalty lands on the whole account, not one page. About{' '}
                {minWords} words of something true about working in that city is enough — press
                <strong> Write a draft</strong> on any city and correct what comes back.
              </span>
            </span>
          )}
        </div>
      )}

      {cities.map((row) => (
        <div key={row.city} className="rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-gray-400" />
              <span className="font-medium text-gray-900">{row.city}</span>
              {/* The address the page actually answers on, built by the same
                  helper the site, the sitemap and the canonical use. It was a
                  hardcoded "/locations/{slug}" and stayed that way through the
                  cutover, so every row on this card named an address the live
                  site had stopped using — read as "the URLs are all wrong",
                  which is what it was. */}
              {previewBase ? (
                <a
                  href={`${previewBase}${locationPath(row.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-gray-400 hover:text-blue-600 hover:underline"
                >
                  {locationPath(row.slug)}
                </a>
              ) : (
                <code className="font-mono text-xs text-gray-400">{locationPath(row.slug)}</code>
              )}
            </div>
            <span
              className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                row.indexable
                  ? 'text-green-700 bg-green-50 border-green-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200'
              }`}
            >
              {/* Not "Noindex". This editor is used by someone who does not
                  need to know the tag's name, and it already says the useful
                  version two lines down ("60 more to index"). */}
              {row.hasShop
                ? 'Shop here — always on Google'
                : row.indexable
                  ? 'On Google'
                  : 'Not on Google yet'}
            </span>
          </div>

          {row.hasShop && (
            <p className="text-xs text-gray-500">
              This city has one of the client&apos;s shops, so the page already carries a real
              address, hours and its own map — unique content no other city page has. Copy here is
              optional.
            </p>
          )}

          <input
            type="text"
            value={row.heading}
            onChange={(e) => edit(row.city, { heading: e.target.value })}
            placeholder={`Heading — e.g. "Windshield replacement in ${row.city}"`}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={row.body}
            onChange={(e) => edit(row.city, { body: e.target.value })}
            rows={4}
            placeholder={`What is actually true about working in ${row.city}? Which neighbourhoods, how long the drive is, what the shop sees most there, a job they did. Anything that could be copied onto another city's page doesn't count.`}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                // Overwrites heading and body with model output, with no undo.
                // Fine on an empty row; on a paragraph someone corrected by
                // hand it is a silent loss.
                if (
                  row.body &&
                  !confirm(
                    `Replace the text for ${row.city} with a new draft? Anything you have written or corrected there is lost.`
                  )
                ) {
                  return
                }
                void draft(row)
              }}
              disabled={drafting === row.city}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {drafting === row.city ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {row.body ? 'Redraft' : 'Write a draft'}
            </button>
            <button
              type="button"
              onClick={() => save(row)}
              disabled={saving === row.city}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving === row.city && <Loader2 size={14} className="animate-spin" />}
              Save {row.city}
            </button>
            <span
              className={`text-xs ${
                row.hasShop || row.wordCount >= minWords ? 'text-green-700' : 'text-gray-500'
              }`}
            >
              {row.wordCount} words
              {!row.hasShop && row.wordCount < minWords && ` — ${minWords - row.wordCount} more to index`}
            </span>
          </div>
        </div>
      ))}

      {message && (
        <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
