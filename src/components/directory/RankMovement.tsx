'use client'

import { useState, useEffect } from 'react'
import {
  Activity,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Camera,
  Mail,
} from 'lucide-react'

interface RankEvent {
  slug: string
  name: string
  city: string
  state: string
  from: number
  to: number
  total: number
  direction: 'dropped' | 'gained'
  passedBy?: { slug: string; name: string }[]
  at: string
}

interface Report {
  takenAt: string
  shops: number
  compared: boolean
  dropped: number
  gained: number
  events: RankEvent[]
  dryRun: boolean
  notified: number
  skipped: number
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(0, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Movement feed + manual snapshot. The daily cron does this automatically;
// this panel is for looking at who's moving (your best outbound list) and for
// forcing a snapshot when you want one now.
export function RankMovement() {
  const [busy, setBusy] = useState<'' | 'load' | 'snap'>('')
  const [error, setError] = useState('')
  const [events, setEvents] = useState<RankEvent[] | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  async function load() {
    setBusy('load')
    setError('')
    try {
      const res = await fetch('/api/directory/rank/snapshot')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setEvents(json.events)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy('')
    }
  }

  async function snapshot(commit: boolean) {
    setBusy('snap')
    setError('')
    try {
      const res = await fetch(`/api/directory/rank/snapshot${commit ? '?commit=1' : ''}`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setReport(json)
      if (commit) load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const shown = events ?? report?.events ?? []

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Activity width={18} height={18} className="text-blue-600" /> Rank movement
            {shown.length > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                {shown.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Who moved up or down in their city. A shop that just got passed is your best call —
            they feel it most right now. Snapshots run daily; owners who opted in get a
            &ldquo;you got passed&rdquo; email automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy !== ''}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {busy === 'load' ? (
            <Loader2 className="animate-spin" width={15} height={15} />
          ) : (
            <RefreshCw width={15} height={15} />
          )}
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => snapshot(false)}
          disabled={busy !== ''}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === 'snap' ? (
            <Loader2 className="animate-spin" width={16} height={16} />
          ) : (
            <Camera width={16} height={16} />
          )}
          Check for movement
        </button>
        {report?.dryRun && (report.dropped > 0 || report.gained > 0) && (
          <button
            type="button"
            onClick={() => snapshot(true)}
            disabled={busy !== ''}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Mail width={16} height={16} /> Save &amp; notify
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
            {report.shops} shops ranked
          </span>
          {!report.compared ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
              First snapshot — movement shows from the next one
            </span>
          ) : (
            <>
              <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
                {report.dropped} dropped
              </span>
              <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-800">
                {report.gained} gained
              </span>
            </>
          )}
          {report.dryRun ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              preview — nothing saved or sent
            </span>
          ) : (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-800">
              saved · {report.notified} emailed
            </span>
          )}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="mt-4 space-y-2">
          {shown.map((e) => (
            <div
              key={`${e.slug}-${e.at}-${e.to}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {e.direction === 'dropped' ? (
                    <TrendingDown width={15} height={15} className="shrink-0 text-red-500" />
                  ) : (
                    <TrendingUp width={15} height={15} className="shrink-0 text-green-600" />
                  )}
                  <span className="truncate font-semibold text-gray-900">{e.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {e.city}, {e.state.toUpperCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  #{e.from} → <strong>#{e.to}</strong> of {e.total}
                  {e.passedBy?.length ? (
                    <span className="text-gray-500">
                      {' '}
                      · passed by {e.passedBy.map((p) => p.name).join(', ')}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-gray-400">{timeAgo(e.at)}</span>
                <a
                  href={`/directory/shop/${e.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  listing
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          No movement recorded yet. Snapshots run daily — once there are two, changes show up
          here.
        </p>
      )}
    </section>
  )
}
