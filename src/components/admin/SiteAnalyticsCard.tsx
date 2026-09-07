'use client'

import { useEffect, useState } from 'react'

/**
 * Point a client at their own Google Analytics property and Search Console
 * site — two picklists, no typing.
 *
 * A PICKLIST RATHER THAN A FIELD, and that is the whole design. A mistyped
 * GA4 property id does not error: it returns another business's traffic, in
 * full, and looks entirely normal doing it. The only ids offered are the ones
 * the platform's own Google account can actually read, so the association
 * cannot name a property that does not exist or that we were never granted.
 *
 * THESE NAME THE SHOP'S MAIN SITE, not the landing page this platform hosts.
 * An SEO client is paying for the site they already had to rank; the hosted
 * page has its own conversion reporting in Google Ads and mixing the two
 * produces a number that answers no question anyone asked.
 */

interface Ga4Property {
  propertyId: string
  displayName: string
  accountName: string
}
interface SearchSite {
  siteUrl: string
  permissionLevel: string
}

export default function SiteAnalyticsCard({
  clientId,
  initialPropertyId,
  initialSiteUrl,
  lastFetchedAt,
  lastError,
}: {
  clientId: string
  initialPropertyId: string | null
  initialSiteUrl: string | null
  lastFetchedAt: string | null
  lastError: string | null
}) {
  const [properties, setProperties] = useState<Ga4Property[]>([])
  const [sites, setSites] = useState<SearchSite[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [listErrors, setListErrors] = useState<string[]>([])
  const [propertyId, setPropertyId] = useState(initialPropertyId || '')
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl || '')
  const [status, setStatus] = useState<string | null>(
    lastError ? `Last refresh failed — ${lastError}` : null
  )
  const [busy, setBusy] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(lastFetchedAt)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/site-analytics/properties')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setConnected(!!data.connected)
        setProperties(data.properties || [])
        setSites(data.sites || [])
        setListErrors(data.errors || [])
      })
      .catch(() => {
        if (!cancelled) setConnected(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* Autosaving, per the convention: flip the visible state first, then
     reconcile. A picklist that waits on a Google round trip before showing
     the new selection feels broken. */
  async function save(patch: Record<string, string>) {
    setBusy(true)
    setStatus('Saving and checking Google can read it…')
    try {
      const res = await fetch(`/api/clients/${clientId}/site-analytics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus(data.error || 'Could not save')
      } else if (data.error) {
        // Saved, but Google refused. Say both — an operator who is told only
        // "saved" goes looking at the portal and finds an empty page.
        setStatus(`Saved, but Google refused: ${data.error}`)
      } else {
        setFetchedAt(data.fetchedAt)
        setStatus(
          data.hasTraffic || data.hasSearch
            ? 'Saved. Data came back.'
            : 'Saved. Nothing selected yet.'
        )
      }
    } catch {
      setStatus('Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    setBusy(true)
    setStatus('Refreshing from Google…')
    try {
      const res = await fetch(`/api/clients/${clientId}/site-analytics`, { method: 'POST' })
      const data = await res.json()
      setFetchedAt(data.fetchedAt || fetchedAt)
      setStatus(data.error ? `Google refused: ${data.error}` : 'Refreshed.')
    } catch {
      setStatus('Could not refresh')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="px-6 pt-5 pb-1">
        <h2 className="font-semibold text-gray-900">Their website&apos;s traffic</h2>
        <p className="text-sm text-gray-500">
          Google Analytics and Search Console for the shop&apos;s <strong>own</strong> website —
          not the landing page we host. This is what the Traffic page in their portal shows.{' '}
          <span className="text-gray-400">Saves on change.</span>
        </p>
      </div>

      <div className="p-6 pt-4 space-y-4">
        {connected === false && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            <p className="font-semibold">Google is not connected yet.</p>
            <p className="mt-1">
              Add <code className="bg-amber-100 px-1 rounded">GOOGLE_ANALYTICS_REFRESH_TOKEN</code>{' '}
              in Settings → API keys. It uses the same OAuth client as Google Ads, but needs its
              own token: the scopes are different, so an Ads token cannot read Analytics.
            </p>
          </div>
        )}

        {listErrors.length > 0 && (
          <p className="text-sm text-amber-700">{listErrors.join(' · ')}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Google Analytics property
          </label>
          <select
            value={propertyId}
            disabled={busy || connected === false}
            onChange={(e) => {
              setPropertyId(e.target.value)
              save({ ga4PropertyId: e.target.value })
            }}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          >
            <option value="">Not connected</option>
            {/* An id already saved but no longer in the list is kept as an
                option rather than silently reset to "Not connected" — that
                would look like nothing was ever set, when in fact we were
                removed from the property. */}
            {propertyId && !properties.some((p) => p.propertyId === propertyId) && (
              <option value={propertyId}>
                {propertyId}
                {/* Only claim it went missing when we could actually have
                    looked. With no token connected the list is empty for a
                    different reason, and saying "no longer visible" would
                    send an operator hunting a permissions problem that is
                    really a missing credential. */}
                {connected ? ' — no longer visible to our Google account' : ''}
              </option>
            )}
            {properties.map((p) => (
              <option key={p.propertyId} value={p.propertyId}>
                {p.displayName}
                {p.accountName ? ` — ${p.accountName}` : ''} ({p.propertyId})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Console property
          </label>
          <select
            value={siteUrl}
            disabled={busy || connected === false}
            onChange={(e) => {
              setSiteUrl(e.target.value)
              save({ searchConsoleSiteUrl: e.target.value })
            }}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          >
            <option value="">Not connected</option>
            {siteUrl && !sites.some((s) => s.siteUrl === siteUrl) && (
              <option value={siteUrl}>
                {siteUrl}
                {connected ? ' — no longer visible to our Google account' : ''}
              </option>
            )}
            {sites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            A domain property (<code>sc-domain:</code>) covers every subdomain and both schemes; a
            URL-prefix property covers only exactly what it says.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={busy || connected === false || (!propertyId && !siteUrl)}
            className="px-3 py-2 rounded-md border text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh now
          </button>
          {fetchedAt && (
            <span className="text-xs text-gray-400">
              Last read {new Date(fetchedAt).toLocaleString()}
            </span>
          )}
        </div>

        {status && <p className="text-sm text-gray-600">{status}</p>}
      </div>
    </section>
  )
}
