'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import GbpPicker, { type PlaceDetails } from '@/components/admin/GbpPicker'

/**
 * Shop locations for a multi-GBP client.
 *
 * Most clients have one shop and never touch this — the address on the
 * Business tab is their location. A client with several shops adds a row per
 * shop here, and from that point the site reads these rows instead: the map
 * section lists every shop, the footer shows every address, each shop's city
 * gets its own location page, and each shop's rating comes from its own
 * Business Profile.
 *
 * The whole list saves as a unit, because "which shop is primary" only has a
 * sensible answer when the set is written together.
 */

export interface LocationRow {
  id: string
  label: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string | null
  hours: string | null
  googlePlaceId: string | null
  googleMapsUrl: string | null
  isPrimary: boolean
  gbpPlaceName?: string | null
  gbpRating?: number | null
  gbpReviewCount?: number | null
  gbpFetchedAt?: string | null
  gbpLastError?: string | null
}

const blank = (): LocationRow => ({
  id: '',
  label: '',
  streetAddress: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  phone: '',
  hours: '',
  googlePlaceId: '',
  googleMapsUrl: '',
  isPrimary: false,
})

export default function ClientLocationsManager({
  clientId,
  fallbackAddress,
}: {
  clientId: string
  /** The single address on the Business tab, shown when there are no rows. */
  fallbackAddress: string
}) {
  const [rows, setRows] = useState<LocationRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/locations`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRows(data.locations || [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const update = (index: number, patch: Partial<LocationRow>) => {
    setRows((prev) => (prev || []).map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setMessage(null)
  }

  /**
   * Apply a picked Business Profile to a row.
   *
   * The label is the one field a human should still own — Google returns the
   * full legal name for every shop, which makes two rows read identically —
   * so it is only seeded when blank, and the city is the useful default.
   */
  const applyPlace = (index: number, details: PlaceDetails) => {
    setRows((prev) =>
      (prev || []).map((row, i) =>
        i === index
          ? {
              ...row,
              label: row.label || details.city || details.businessName,
              streetAddress: details.streetAddress || row.streetAddress,
              city: details.city || row.city,
              state: details.state || row.state,
              postalCode: details.postalCode || row.postalCode,
              country: details.country || row.country || 'US',
              phone: details.phone || row.phone,
              googlePlaceId: details.placeId,
              googleMapsUrl: details.googleMapsUrl || row.googleMapsUrl,
            }
          : row
      )
    )
    setMessage(null)
  }

  const makePrimary = (index: number) => {
    setRows((prev) => (prev || []).map((row, i) => ({ ...row, isPrimary: i === index })))
    setMessage(null)
  }

  const remove = (index: number) => {
    const row = (rows || [])[index]
    if (row?.id && !confirm(`Remove the ${row.label || 'unnamed'} shop from the site?`)) return
    setRows((prev) => (prev || []).filter((_, i) => i !== index))
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/locations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: rows || [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save locations')
      setRows(data.locations || [])
      setMessage({ ok: true, text: 'Saved. The site updates within about 5 minutes.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function refreshReviews(row: LocationRow) {
    setRefreshingId(row.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/locations/${row.id}/refresh-reviews`, {
        method: 'POST',
      })
      const data = await res.json()
      setMessage({ ok: !!data.ok, text: data.message || data.error || 'Done' })
      if (data.ok) {
        const listed = await fetch(`/api/clients/${clientId}/locations`).then((r) => r.json())
        setRows(listed.locations || [])
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Refresh failed' })
    } finally {
      setRefreshingId(null)
    }
  }

  if (rows === null) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading shops…
      </div>
    )
  }

  return (
    <div className="p-6 pt-4 space-y-4">
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-800">One shop, using the address on this tab</p>
          <p className="mt-1">{fallbackAddress}</p>
          <p className="mt-2 text-gray-500">
            Add shops below only if this client runs more than one. As soon as there is a row here,
            the site uses these addresses instead of the one above — so add <em>every</em> shop,
            including this one.
          </p>
        </div>
      )}

      {rows.map((row, i) => (
        <div key={row.id || `new-${i}`} className="rounded-xl border border-gray-200 p-4 space-y-3">
          <GbpPicker
            label={`Find ${row.label || 'this shop'} on Google`}
            onSelect={(details) => applyPlace(i, details)}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Shop name (shown on the site)
              </label>
              <input
                type="text"
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="NW Portland"
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => makePrimary(i)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border ${
                  row.isPrimary
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title="The shop the site leads with when no city narrows it down"
              >
                <Star size={14} className={row.isPrimary ? 'fill-amber-400 text-amber-500' : ''} />
                {row.isPrimary ? 'Main shop' : 'Make main'}
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                aria-label="Remove shop"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Street address</label>
            <input
              type="text"
              value={row.streetAddress}
              onChange={(e) => update(i, { streetAddress: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input
                type="text"
                value={row.city}
                onChange={(e) => update(i, { city: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
              <input
                type="text"
                value={row.state}
                onChange={(e) => update(i, { state: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
              <input
                type="text"
                value={row.postalCode}
                onChange={(e) => update(i, { postalCode: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
              <select
                value={row.country || 'US'}
                onChange={(e) => update(i, { country: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Phone <span className="text-gray-400">(blank = main number)</span>
              </label>
              <input
                type="tel"
                value={row.phone || ''}
                onChange={(e) => update(i, { phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hours <span className="text-gray-400">(shown exactly as typed)</span>
              </label>
              <input
                type="text"
                value={row.hours || ''}
                onChange={(e) => update(i, { hours: e.target.value })}
                placeholder="Mon–Fri 8–5, Sat 9–2"
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Google Place ID (this shop&apos;s profile)
              </label>
              <input
                type="text"
                value={row.googlePlaceId || ''}
                onChange={(e) => update(i, { googlePlaceId: e.target.value })}
                placeholder="ChIJ..."
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Google Maps URL</label>
              <input
                type="url"
                value={row.googleMapsUrl || ''}
                onChange={(e) => update(i, { googleMapsUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {row.id && (
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-gray-500">
              {row.gbpRating != null ? (
                <span>
                  {row.gbpRating.toFixed(1)}★ · {row.gbpReviewCount} reviews
                  {row.gbpFetchedAt
                    ? ` · updated ${new Date(row.gbpFetchedAt).toLocaleDateString()}`
                    : ''}
                </span>
              ) : (
                <span>No cached rating for this shop yet.</span>
              )}
              <button
                type="button"
                onClick={() => refreshReviews(row)}
                disabled={!row.googlePlaceId || refreshingId === row.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {refreshingId === row.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Refresh reviews
              </button>
              {row.gbpLastError && <span className="text-red-600">{row.gbpLastError}</span>}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows([...(rows || []), blank()])}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
        >
          <Plus size={15} /> Add shop
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save shops
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
