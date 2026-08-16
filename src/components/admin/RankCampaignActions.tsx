'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

/**
 * The controls for the rank campaigns, on the page about rank campaigns.
 *
 * These lived on the API-keys card, wedged into a row beside the key itself,
 * which is where you look to paste a credential and not where you look when
 * a map is wrong. Six buttons deep in a settings panel is a button nobody
 * finds.
 */
const ACTIONS: Array<{
  label: string
  endpoint: string
  hint: string
  confirm?: string
}> = [
  {
    label: 'Create campaigns now',
    endpoint: '/api/admin/rank-campaigns/run',
    hint: 'Builds a campaign for every client that has none — at 1207 m spacing, on a weekday in business hours. Spends a run’s credits per client created.',
    confirm:
      'Create a rank campaign for every client that does not have one?\n\nSEO clients: weekly on four keywords. Everyone else: monthly on two. Each one runs immediately, which spends a run’s credits per client.',
  },
  {
    label: 'Refresh map URLs',
    endpoint: '/api/admin/rank-campaigns/map-status',
    hint: 'Fetches each campaign’s all-keywords map and stores it. Free. Start here when a map looks wrong.',
  },
  {
    label: 'Apply grid spacing',
    endpoint: '/api/admin/rank-campaigns/respace',
    hint: 'Sets every campaign to 1207 m between pins — 6.75 miles across. Free, and takes effect on the next run.',
  },
  {
    label: 'Apply run schedule',
    endpoint: '/api/admin/rank-campaigns/reschedule',
    hint: 'Moves every scan to a Tuesday in business hours, so weekend results stop skewing the trend. Free.',
  },
  {
    label: 'Run every scan now',
    endpoint: '/api/admin/rank-campaigns/run-now',
    hint: 'Takes a fresh scan on every campaign. Spends a run’s credits each — the only way a spacing change reaches a map today.',
    confirm:
      'Start a fresh run on every campaign now?\n\nThis spends a run’s credits per campaign. Their scheduler holds the geometry, so the maps keep the old zoom until a scan is taken at the new spacing.',
  },
]

export default function RankCampaignActions() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [purgeScans, setPurgeScans] = useState(false)

  async function run(endpoint: string, confirmText?: string, payload?: unknown) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(endpoint)
    setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        ...(payload
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
          : {}),
      })
      const data = await res.json().catch(() => ({}))
      setResult({ ok: !!data.success, message: data.message || (res.ok ? 'Done.' : 'Failed.') })
    } catch {
      setResult({ ok: false, message: 'Request failed.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">Campaign controls</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        These change the scans at Local Dominator. Everything here edits the existing campaigns in
        place — none of it creates duplicates.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIONS.map((action) => (
          <div key={action.endpoint} className="rounded-xl border border-gray-200 p-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run(action.endpoint, action.confirm)}
            >
              {busy === action.endpoint ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                action.label
              )}
            </Button>
            <p className="mt-2 text-xs text-gray-600">{action.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-bold text-red-900">Delete every campaign</h3>
        <p className="mt-1 text-xs text-red-900 max-w-prose">
          Irreversible at Local Dominator — deleting a scheduled scan takes its runs with it.
          Recreating is not a restore: new campaigns, new share tokens, and a run&apos;s credits
          per client the moment they are created.
        </p>
        <label className="mt-3 flex items-start gap-2 text-xs text-red-900 cursor-pointer">
          <input
            type="checkbox"
            checked={purgeScans}
            onChange={(e) => setPurgeScans(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-red-300"
          />
          <span>
            Also delete the scans stored here. Left alone they keep the trend history, but their
            maps point at tokens Local Dominator will have purged, so those frames go dead.
          </span>
        </label>
        <div className="mt-3">
          <Button
            size="sm"
            variant="danger"
            disabled={busy !== null}
            onClick={() =>
              run(
                '/api/admin/rank-campaigns/delete-all',
                `Delete EVERY rank campaign at Local Dominator?\n\n${
                  purgeScans
                    ? 'Stored scan history here will be deleted too.\n\n'
                    : 'Stored scans here are kept, but their maps will go dead.\n\n'
                }This cannot be undone. Recreating spends a run's credits per client.`,
                { purgeScans }
              )
            }
          >
            {busy === '/api/admin/rank-campaigns/delete-all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Delete all campaigns'
            )}
          </Button>
        </div>
      </div>

      {result && (
        <p
          className={`mt-4 text-sm flex items-start gap-1.5 ${
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
    </div>
  )
}
