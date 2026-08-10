'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Deleting a client, with the consequences shown before the button.
 *
 * A confirm dialog reading "Are you sure?" is answered yes by everyone, every
 * time — it asks about intent, which the operator already has, rather than
 * about scope, which they usually do not. So this states the scope in the
 * numbers that matter: how many leads, how far back, how much closed revenue.
 * Then it asks for the business name to be typed, which cannot be done by
 * muscle memory on the wrong client.
 *
 * The lead export sits directly above the delete on purpose. This is the last
 * moment those records exist, and it is the obvious thing to want ten minutes
 * afterwards.
 */

interface Impact {
  businessName: string
  leads: number
  soldLeads: number
  revenue: number
  photos: number
  portalUsers: number
  callAnalyses: number
  domains: string[]
  subdomain: string | null
  firstLeadAt: string | null
}

export default function DeleteClientCard({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [impact, setImpact] = useState<Impact | null>(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  async function reveal() {
    setOpen(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/deletion-impact`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load')
      setImpact(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load')
    }
  }

  async function destroy() {
    if (!impact) return
    setBusy(true)
    setError('')
    setWarnings([])
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      if (data.warnings?.length) {
        // Shown rather than swallowed: these are things now needing a human in
        // Vercel or Cloudflare, and the client record that named them is gone.
        setWarnings(data.warnings)
        setBusy(false)
        return
      }
      router.push('/admin/clients')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  const nameMatches =
    !!impact && typed.trim().toLowerCase() === impact.businessName.trim().toLowerCase()

  if (warnings.length > 0) {
    return (
      <section className="bg-white rounded-2xl border border-amber-300 shadow-sm p-5 space-y-3">
        <h2 className="font-bold text-gray-900">Client deleted, with loose ends</h2>
        <ul className="list-disc ml-5 text-sm text-amber-900 space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push('/admin/clients')}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
        >
          Back to clients
        </button>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-5">
      <h2 className="font-bold text-gray-900">Danger zone</h2>
      <p className="text-sm text-gray-600 mb-3">
        Deleting a client removes their site, their leads and everything attached. There is no
        undo. If they are only leaving for a while, set their status to <strong>Paused</strong> on
        the Business tab instead — the site goes offline and the data stays.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={reveal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50"
        >
          <Trash2 size={15} /> Delete this client
        </button>
      ) : !impact ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Working out what this would remove…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="flex items-start gap-2 font-semibold">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              This permanently deletes:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-0.5">
              <li>
                <strong>{impact.leads}</strong> lead{impact.leads === 1 ? '' : 's'}
                {impact.firstLeadAt && (
                  <> going back to {new Date(impact.firstLeadAt).toLocaleDateString()}</>
                )}
                {impact.soldLeads > 0 && (
                  <>
                    , including {impact.soldLeads} sold
                    {impact.revenue > 0 && <> worth ${impact.revenue.toLocaleString()}</>}
                  </>
                )}
              </li>
              {impact.callAnalyses > 0 && (
                <li>
                  {impact.callAnalyses} call recording{impact.callAnalyses === 1 ? '' : 's'} and
                  their coaching reports
                </li>
              )}
              {impact.photos > 0 && <li>{impact.photos} uploaded photos</li>}
              {impact.portalUsers > 0 && (
                <li>
                  {impact.portalUsers} portal login{impact.portalUsers === 1 ? '' : 's'}
                </li>
              )}
              {(impact.subdomain || impact.domains.length > 0) && (
                <li>
                  Their site at{' '}
                  {[impact.subdomain ? `${impact.subdomain}.glassleads.app` : null, ...impact.domains]
                    .filter(Boolean)
                    .join(', ')}
                </li>
              )}
            </ul>
          </div>

          {impact.leads > 0 && (
            <a
              href={`/api/clients/${clientId}/leads-export`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
            >
              <Download size={15} /> Download all {impact.leads} leads as CSV first
            </a>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm-name">
              Type <strong>{impact.businessName}</strong> to confirm
            </label>
            <input
              id="confirm-name"
              type="text"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              className="w-full max-w-md px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={destroy}
              disabled={!nameMatches || busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete {impact.businessName} permanently
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError('')
              }}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
