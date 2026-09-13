'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, MapPin, XCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { errorFrom } from '@/lib/http-error'

/**
 * Whether this client's rankings are actually being measured, and why not.
 *
 * THE GAP THIS FILLS. Rank tracking has no enable step — every client is
 * supposed to get a campaign, and a daily sweep converges on that — so there
 * was nothing anywhere that said a client did NOT have one. The sweep counted
 * a skip, the admin Rankings page just did not list the client, the portal
 * hid its Rankings tab, and the SEO switch said "no campaign yet" whether
 * that meant "wait until tomorrow" or "never, for this reason".
 *
 * Those two are the entire difference and nothing distinguished them. So this
 * card states which it is, names the blocker when there is one, and — because
 * the sweep runs at 04:00 UTC and an operator who has just fixed the blocker
 * should not have to wait overnight to find out whether they fixed it — can
 * create the campaign on the spot.
 */
export default function RankTrackingCard({
  clientId,
  hasCampaign,
  canCreate,
  problem,
  campaignId,
  keywords,
  seoClient,
  scanCount,
}: {
  clientId: string
  hasCampaign: boolean
  canCreate: boolean
  problem: string | null
  campaignId: string | null
  keywords: string[]
  seoClient: boolean
  scanCount: number
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [created, setCreated] = useState(false)

  async function createNow() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/rank-campaign`, { method: 'POST' })
      if (!res.ok) throw new Error(await errorFrom(res, 'Could not create it'))
      const data = await res.json()
      setResult({ ok: true, message: data.message || 'Created.' })
      setCreated(true)
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  const live = hasCampaign || created

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-400" />
        Rank tracking
      </h2>

      {live ? (
        <div className="mt-3 text-sm text-gray-700 space-y-1">
          <p className="flex items-start gap-1.5 text-green-700">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Measured {seoClient ? 'weekly' : 'monthly'}
              {keywords.length ? ` on ${keywords.join(', ')}` : ''}.
            </span>
          </p>
          {/* A campaign with no runs yet is the normal state for days, and
              the thing an operator will otherwise read as broken. */}
          <p className="text-gray-500">
            {scanCount > 0
              ? `${scanCount} scan${scanCount === 1 ? '' : 's'} recorded. `
              : 'No scan has completed yet — the first one runs on the campaign’s schedule, and the map appears after it. '}
            <Link href={`/admin/clients/${clientId}/rankings`} className="text-blue-600 hover:underline">
              Rankings tab
            </Link>
            {campaignId ? <span className="text-gray-400"> · campaign {campaignId}</span> : null}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm flex items-start gap-1.5 text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              No campaign, so nothing is being measured — and the client&apos;s portal hides its
              Rankings tab until there is one.
            </span>
          </p>
          {problem && <p className="text-sm text-gray-700">{problem}</p>}
          {canCreate ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={createNow}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                {busy ? 'Creating…' : 'Set up rank tracking now'}
              </button>
              <span className="text-xs text-gray-500">
                {seoClient ? 'Weekly on four keywords' : 'Monthly on two keywords'} — the same
                campaign tonight&apos;s sweep would create. Scans cost credits.
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Fix the above and press again — or leave it, and the nightly sweep picks it up on its
              own once it can.
            </p>
          )}
        </div>
      )}

      {result && (
        <p
          className={`mt-3 text-sm flex items-start gap-1.5 ${
            result.ok ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {result.ok ? (
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{result.message}</span>
        </p>
      )}
    </section>
  )
}
