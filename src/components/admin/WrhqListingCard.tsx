'use client'

import { useState } from 'react'
import { AlertCircle, Check, ExternalLink, Globe2, Loader2, RefreshCw } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The shop's Windshield Repair HQ listing — is there one, where is it, and
 * push it again.
 *
 * WHY THIS EXISTS. The sync ran on client create, intake approval and every
 * Business-tab save, and nothing anywhere said whether any of it had worked.
 * The failure message was computed, returned in the save response and read by
 * nobody; the slug the directory sent back was thrown away. So a listing was
 * either fine or silently missing, and there was no way to tell which without
 * opening the directory and searching for the shop by hand.
 *
 * NOT A SETTING. There is no "list this client" switch, deliberately: every
 * client on this platform gets a Partner listing, and a toggle would invite
 * the question of which ones should. What the tier follows is `status` —
 * anything but ACTIVE sends `inactive`, which drops the Partner benefits and
 * KEEPS the listing, so a returning client gets their page and its earned
 * ranking back.
 */
export default function WrhqListingCard({
  clientId,
  slug,
  url,
  syncedAt,
  error,
  configured,
  canBeListed,
}: {
  clientId: string
  slug: string | null
  url: string | null
  syncedAt: string | null
  error: string | null
  /** WRHQ_SYNC_URL and WRHQ_SYNC_SECRET are both set on this deployment. */
  configured: boolean
  /** A city and a 2-letter state — without both the directory cannot place it. */
  canBeListed: boolean
}) {
  const [busy, setBusy] = useState<'sync' | 'check' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // Optimistic, per the autosaving convention: the card should show the new
  // state as soon as the answer arrives rather than waiting for a page reload.
  const [live, setLive] = useState({ slug, url, syncedAt, error })

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'check' : 'sync')
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/wrhq-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'The directory could not be reached'))
      const data = await res.json()
      if (!data.ok) {
        setLive((s) => ({ ...s, error: data.error || 'Sync failed' }))
        setMessage({ ok: false, text: data.error || 'The directory refused it.' })
        return
      }
      if (dryRun) {
        /* THE ONLY QUESTION A DRY RUN IS FOR. Most of these shops are already
           in the directory as unclaimed listings, and the answer that matters
           is whether this one gets matched to a page it already has or gets a
           brand new one — two pages for one business is the thing to avoid. */
        setMessage({
          ok: true,
          text: data.wouldCreate
            ? 'Not in the directory yet — syncing would create a new listing.'
            : `Already in the directory${data.matchedOn ? ` (matched on ${data.matchedOn})` : ''} — syncing would update that listing, not add one.`,
        })
        return
      }
      setLive({
        slug: data.slug ?? live.slug,
        url: data.url ?? live.url,
        syncedAt: new Date().toISOString(),
        error: null,
      })
      setMessage({
        ok: true,
        text: data.created
          ? 'Listing created.'
          : `Listing updated${data.matchedOn ? ` (matched on ${data.matchedOn})` : ''}.`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  const listed = !!live.slug
  const tone = !configured
    ? 'text-gray-400 bg-gray-100'
    : live.error
      ? 'text-red-600 bg-red-50'
      : listed
        ? 'text-green-600 bg-green-50'
        : 'text-amber-600 bg-amber-50'

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}>
          <Globe2 className="h-4 w-4" />
        </span>
        <h2 className="font-semibold text-gray-900 text-sm">Windshield Repair HQ</h2>
      </div>

      <div className="text-sm text-gray-600 flex-1 space-y-2">
        {!configured ? (
          /* Not configured is not broken, and must not read as broken. Naming
             the two variables is the whole fix — there is nothing to press. */
          <p className="text-gray-500">
            The directory sync is not switched on for this deployment. Set{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">WRHQ_SYNC_URL</code> and{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">WRHQ_SYNC_SECRET</code> in Vercel.
          </p>
        ) : (
          <>
            {listed ? (
              <p className="flex items-start gap-1.5 text-green-700">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                Listed as a Partner — top of their city, no ads on their page.
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-amber-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                No listing recorded yet. It is created automatically on approval and on any
                change to their business details — or press Sync now.
              </p>
            )}

            {live.slug && (
              /* THE LINK IS ONLY EVER WHAT THE DIRECTORY RETURNED. Building
                 one out of the slug means guessing its route shape, and a
                 dead link on this card would send whoever clicks it hunting a
                 listing that is perfectly fine. No URL, print the slug. */
              <p className="break-all">
                {live.url ? (
                  <a
                    href={live.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
                  >
                    View their listing
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-gray-500">
                    Listing <span className="font-mono text-xs text-gray-700">{live.slug}</span>
                  </span>
                )}
              </p>
            )}

            {!canBeListed && (
              <p className="flex items-start gap-1.5 text-amber-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                The directory places listings by city and state, and this client has no city or a
                state that is not two letters. Fix it on the Business tab first.
              </p>
            )}

            {/* Not repeated when the line above already said it in better
                words. A client with no city fails for exactly one reason, and
                stating it twice — once as advice, once as a raw error — makes
                a fixable setup gap look like two separate faults. */}
            {live.error && canBeListed && (
              <p className="flex items-start gap-1.5 text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Last sync failed: {live.error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => run(false)}
                disabled={!!busy}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === 'sync' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync now
              </button>
              <button
                type="button"
                onClick={() => run(true)}
                disabled={!!busy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Check without sending
              </button>
            </div>

            {message && (
              <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
                {message.text}
              </p>
            )}

            {live.syncedAt && !message && (
              <p className="text-xs text-gray-400">
                Last synced {new Date(live.syncedAt).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
