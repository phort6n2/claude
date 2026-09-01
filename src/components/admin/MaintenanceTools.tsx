'use client'

import { useState } from 'react'
import { AlertTriangle, Copy, Loader2, Play, ShieldCheck } from 'lucide-react'

/**
 * The operational endpoints, with buttons.
 *
 * They existed already and were run by pasting a URL — which works for the
 * handful that answer GET and not at all for the rest, because a browser
 * cannot POST from an address bar. So the ones that matter most were the
 * hardest to reach.
 *
 * READ AND WRITE ARE SEPARATED ON SCREEN, in that order, because that is the
 * order they should be run in: find out what is wrong, then change something.
 * Every writing tool says what it touches before it is pressed and asks once,
 * since several of these reach out to another company's account.
 *
 * Deliberately absent: anything that deletes. Wiping every rank campaign is a
 * real endpoint and it is not going behind a button on a page somebody opens
 * to check on things.
 */

interface Tool {
  key: string
  name: string
  path: string
  method: 'GET' | 'POST'
  what: string
  /** Named consequence, shown before the confirm. Absent means read-only. */
  cost?: string
}

const READS: Tool[] = [
  {
    key: 'cadence',
    name: 'Rank campaigns: are they running, and are the runs reaching us?',
    path: '/api/admin/rank-campaigns/cadence',
    method: 'GET',
    what: 'Per campaign: the tier and the cron it should have, the cron and next run Local Dominator holds, their run count and last run against ours, and whether the webhook URL they post to is one we would still accept.',
  },
  {
    key: 'conversion-audit',
    name: 'Google Ads: does every account match the standard?',
    path: '/api/admin/google-ads/conversion-audit',
    method: 'GET',
    what: 'Every client with a linked Ads account, checked against the four AGMP conversion actions — names, settings, which goals bid, and anything counting the same lead twice.',
  },
  {
    key: 'runs',
    name: 'Rank runs: what does Local Dominator still hold?',
    path: '/api/admin/rank-campaigns/runs',
    method: 'GET',
    what: 'Every run their campaign record carries, against the ones we stored, and the shape of one — so a run we never received can be identified and, if the shape allows, recovered without paying for a re-scan. Defaults to the first SEO client; add ?clientId= for a specific one.',
  },
  {
    key: 'inspect',
    name: 'Rank payload: what shape are the stored scans?',
    path: '/api/admin/rank-campaigns/inspect',
    method: 'GET',
    what: 'The structure of a stored scan payload, without dumping the grid. For checking the reader against what actually arrives rather than against the docs.',
  },
  {
    key: 'embed-check',
    name: 'Rank maps: can their report be framed?',
    path: '/api/admin/rank-campaigns/embed-check',
    method: 'POST',
    what: 'Probes every URL shape with the real tokens from a stored payload and reports which ones answer and which allow embedding. Reads only — it fetches their pages, changes nothing.',
  },
]

const WRITES: Tool[] = [
  {
    key: 'ads-daily-run',
    name: 'Google Ads: run the daily anomaly checks now',
    path: '/api/admin/ads-findings/run',
    method: 'POST',
    what: 'The same sweep the morning cron runs: spend cliffs and spikes, disapproved ads, budget-capped campaigns, conversions gone quiet, and edits by other people. Files findings and sends the digest email if anything new appeared.',
    cost: 'Reads every linked Ads account (four queries each) and writes finding rows. Sends the digest email when there is something new to say.',
  },
  {
    key: 'derive-footer-logos',
    name: 'Generate white footer logos for every client',
    path: '/api/admin/derive-footer-logos',
    method: 'POST',
    what: 'For each client with a header logo and no footer logo: if the image has real transparency, a white copy is generated and stored as the footer logo. Opaque logos are skipped and those footers show the wordmark.',
    cost: 'Writes footerLogoUrl and uploads one PNG per derived logo to blob storage. Never overwrites a footer logo that already exists. Safe to run twice.',
  },
  {
    key: 'rewebhook',
    name: 'Re-register the rank webhook on every campaign',
    path: '/api/admin/rank-campaigns/rewebhook',
    method: 'POST',
    what: 'Sets the current webhook URL on each campaign and reads it back to confirm. This is the fix when the audit says the URL they hold is one we no longer accept.',
    cost: 'Writes to Local Dominator: one PATCH per campaign. Campaigns keep their id, history and credits. Safe to run twice — a campaign already correct is skipped.',
  },
  {
    key: 'map-status',
    name: 'Refresh the all-keywords map URLs',
    path: '/api/admin/rank-campaigns/map-status',
    method: 'POST',
    what: 'Fetches each campaign’s share link, stores it on the client, and reports every link in the chain.',
    cost: 'Writes rankMapUrl on the clients it can resolve one for.',
  },
  {
    key: 'repair',
    name: 'Recompute stored rank scans',
    path: '/api/admin/rank-campaigns/repair',
    method: 'POST',
    what: 'Re-reads the stored raw payloads and rewrites the derived numbers, asserting their average against ours on every run.',
    cost: 'Rewrites stored scan rows. No new scans, no credits — the raw payloads are kept precisely so a reader bug costs a recompute rather than a re-scan.',
  },
  {
    key: 'reschedule',
    name: 'Put every campaign back on its tier’s cron',
    path: '/api/admin/rank-campaigns/reschedule',
    method: 'POST',
    what: 'Proves what their cron means on ONE campaign by reading next_run_at back before touching the rest.',
    cost: 'Writes the schedule on their side. Getting this wrong on a monthly client quadruples their credits, which is why it tests one first.',
  },
  {
    key: 'respace',
    name: 'Re-space every grid',
    path: '/api/admin/rank-campaigns/respace',
    method: 'POST',
    what: 'PATCHes the geometry of each campaign in place to match SCAN_PRESETS.',
    cost: 'Writes geometry on their side. Never deletes and recreates — that would orphan stored runs and burn credits.',
  },
  {
    key: 'setup-db',
    name: 'Run the database bootstrap',
    path: '/api/admin/setup-db',
    method: 'POST',
    what: 'Runs every idempotent schema statement the code expects to exist. The same set the server runs at boot.',
    cost: 'Runs DDL. Every statement is IF NOT EXISTS, so running it when nothing is missing does nothing at all.',
  },
]

export default function MaintenanceTools() {
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<{ key: string; status: number; body: string } | null>(null)

  async function run(tool: Tool) {
    if (tool.cost && !window.confirm(`${tool.name}\n\n${tool.cost}\n\nRun it?`)) return
    setRunning(tool.key)
    setOutput(null)
    try {
      const res = await fetch(tool.path, { method: tool.method })
      const text = await res.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // Not JSON — an HTML error page. Showing it raw is more useful than
        // "could not parse", which is what sent somebody hunting the wrong bug.
      }
      setOutput({ key: tool.key, status: res.status, body })
    } catch (err) {
      setOutput({
        key: tool.key,
        status: 0,
        body: err instanceof Error ? err.message : 'Request failed',
      })
    } finally {
      setRunning(null)
    }
  }

  const row = (tool: Tool) => (
    <div key={tool.key} className="rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 text-sm">{tool.name}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tool.what}</p>
          {tool.cost && (
            <p className="text-xs text-amber-800 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {tool.cost}
            </p>
          )}
          <p className="text-[11px] text-gray-400 font-mono mt-1.5">
            {tool.method} {tool.path}
          </p>
        </div>
        <button
          type="button"
          onClick={() => run(tool)}
          disabled={!!running}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
            tool.cost
              ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              : 'border border-gray-300 bg-white hover:bg-gray-50'
          }`}
        >
          {running === tool.key ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run
        </button>
      </div>

      {output?.key === tool.key && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                output.status >= 200 && output.status < 300
                  ? 'text-green-700 bg-green-50 border-green-200'
                  : 'text-red-700 bg-red-50 border-red-200'
              }`}
            >
              {output.status || 'no response'}
            </span>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(output.body)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <pre className="text-[11px] leading-relaxed bg-gray-900 text-gray-100 rounded-lg p-3 overflow-auto max-h-96">
            {output.body}
          </pre>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={17} className="text-green-600" /> Checks
          </h2>
          <p className="text-sm text-gray-500">
            Read only. Nothing here changes anything, on our side or anyone else&apos;s.
          </p>
        </div>
        <div className="p-6 pt-4 space-y-3">{READS.map(row)}</div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-600" /> Fixes
          </h2>
          <p className="text-sm text-gray-500">
            These change something. Each says what before it asks — run a check first.
          </p>
        </div>
        <div className="p-6 pt-4 space-y-3">{WRITES.map(row)}</div>
      </section>
    </div>
  )
}
