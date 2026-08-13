'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Upload, TriangleAlert, CircleCheck, FlaskConical } from 'lucide-react'

/**
 * Sending booked job values back to Google Ads.
 *
 * The dry run is the primary button, not a hidden option. Every rule this has
 * to satisfy is enforced at Google's end — the conversion action's type, the
 * age of the click, the date format — so the first attempt against a live
 * account is genuinely likely to fail, and finding that out by writing wrong
 * revenue into an account that is bidding on it is the one outcome worth
 * engineering against.
 */

interface Action {
  id: string
  name: string
  status: string
}

interface State {
  customerId: string | null
  actionId: string | null
  actions: Action[]
  pending: number
  pendingValue: number
  examples: Array<{ name: string; value: number; soldAt: string }>
  blocked: string | null
}

interface Outcome {
  ok: boolean
  attempted: number
  succeeded: number
  failed: Array<{ leadId: string; error: string }>
  error?: string
  dryRun: boolean
}

export default function OfflineConversionsCard({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState<null | 'save' | 'dry' | 'live'>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/ads-offline`)).json()
      setState(data)
    } catch {
      setState(null)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function chooseAction(actionId: string) {
    setBusy('save')
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-offline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not save')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function run(dryRun: boolean) {
    if (!dryRun && !confirm('This writes real conversions into the Google Ads account and will change how it bids.\n\nRun the check first if you have not.')) return
    setBusy(dryRun ? 'dry' : 'live')
    setError(null)
    setOutcome(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!res.ok && !data.attempted) throw new Error(data.error || 'Upload failed')
      setOutcome(data)
      if (!dryRun) await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  if (!state) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    )
  }

  const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="p-6 pt-4 space-y-5">
      <p className="text-sm text-gray-600">
        Google only knows a form was filled in. Sending back what each job was actually worth lets
        Smart Bidding chase revenue instead of submissions — the clicks that produce cheap
        non-jobs get bid down without anyone writing a negative keyword.
      </p>

      {state.blocked && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{state.blocked}</span>
        </div>
      )}

      {state.actions.length > 0 && (
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Upload booked jobs to
          </span>
          <select
            value={state.actionId || ''}
            onChange={(e) => chooseAction(e.target.value)}
            disabled={busy === 'save'}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Not set — nothing will upload</option>
            {state.actions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.status !== 'ENABLED' ? ` (${a.status.toLowerCase()})` : ''}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-400 mt-1">
            Keep this separate from the website tag. That one counts form fills; this one counts
            jobs that were sold, and mixing them has bidding optimising for both at once.
          </span>
        </label>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-900">
          <strong>{state.pending}</strong> booked{' '}
          {state.pending === 1 ? 'job is' : 'jobs are'} waiting to upload
          {state.pendingValue > 0 && <> · {money(state.pendingValue)}</>}
        </p>
        {state.examples.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
            {state.examples.map((e, i) => (
              <li key={i}>
                {e.name} — {money(e.value)} on {new Date(e.soldAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Only leads marked sold, with an amount and a click ID, inside the attribution window,
          not already sent.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={!!busy || !state.actionId || state.pending === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === 'dry' ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
          Check without sending
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={!!busy || !state.actionId || state.pending === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'live' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Upload for real
        </button>
      </div>

      {outcome && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            outcome.failed.length || outcome.error
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-green-300 bg-green-50 text-green-900'
          }`}
        >
          <p className="font-medium flex items-center gap-1.5">
            {outcome.failed.length || outcome.error ? (
              <TriangleAlert size={15} />
            ) : (
              <CircleCheck size={15} />
            )}
            {outcome.dryRun ? 'Check only — nothing was recorded. ' : ''}
            {outcome.succeeded} of {outcome.attempted} accepted
          </p>
          {outcome.error && <p className="mt-1">{outcome.error}</p>}
          {outcome.failed.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {outcome.failed.slice(0, 5).map((f) => (
                <li key={f.leadId}>{f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
