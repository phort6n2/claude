'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MinusCircle,
  Stethoscope,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type { HealthRow } from '@/app/api/admin/conversion-health/route'

/**
 * Conversion setup across the whole book, split by tier.
 *
 * The point is to answer "where is money leaking?" without opening fifteen
 * Advertising tabs. The two tiers ask different questions, so they are two
 * tables rather than one with a column:
 *
 *   Managed — we run the ads, so a broken tag is our failure and urgent.
 *   Self-serve — we don't, so the tag is informational, and the interesting
 *   column is lead volume, because that is the upsell queue.
 *
 * Live checks run per row on demand. Fetching fifteen sites and querying
 * Google fifteen times on page load would make this screen take half a minute
 * and nobody would open it twice.
 */

interface Check {
  label: string
  ok: boolean
  detail: string
  info?: boolean
}

type CheckState = { running: boolean; checks?: Check[]; error?: string }

/** Concurrency cap. Each check fetches a live site and may call Google. */
const PARALLEL = 3

function verdict(checks: Check[] | undefined) {
  if (!checks) return null
  const real = checks.filter((c) => !c.info)
  const failed = real.filter((c) => !c.ok)
  return { failed: failed.length, total: real.length, first: failed[0] }
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function ConversionHealthTable() {
  const [rows, setRows] = useState<HealthRow[] | null>(null)
  const [state, setState] = useState<Record<string, CheckState>>({})
  const [runningAll, setRunningAll] = useState(false)

  useEffect(() => {
    fetch('/api/admin/conversion-health')
      .then((r) => r.json())
      .then((d) => setRows(d.rows || []))
      .catch(() => setRows([]))
  }, [])

  const check = useCallback(async (row: HealthRow) => {
    setState((p) => ({ ...p, [row.id]: { running: true } }))
    try {
      const res = await fetch(`/api/clients/${row.id}/ads-tracking/verify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setState((p) => ({ ...p, [row.id]: { running: false, checks: data.checks || [] } }))
    } catch (err) {
      setState((p) => ({
        ...p,
        [row.id]: { running: false, error: err instanceof Error ? err.message : 'Failed' },
      }))
    }
  }, [])

  /** Run every configured row, a few at a time. */
  async function checkAll(list: HealthRow[]) {
    setRunningAll(true)
    const queue = list.filter((r) => r.conversionId || r.bingTagId)
    for (let i = 0; i < queue.length; i += PARALLEL) {
      await Promise.all(queue.slice(i, i + PARALLEL).map(check))
    }
    setRunningAll(false)
  }

  if (!rows) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading clients…
      </div>
    )
  }

  const managed = rows.filter((r) => r.managed)
  // Upsell queue: the ones producing leads are the ones worth calling.
  const selfServe = rows.filter((r) => !r.managed).sort((a, b) => b.leads30d - a.leads30d)

  const Row = ({ row, showLeads }: { row: HealthRow; showLeads: boolean }) => {
    const s = state[row.id]
    const v = verdict(s?.checks)
    const configured = !!(row.conversionId || row.bingTagId)
    return (
      <tr className="border-t border-gray-100 align-top">
        <td className="py-3 pr-3">
          <Link
            href={`/admin/clients/${row.id}/advertising`}
            className="font-medium text-gray-900 hover:text-blue-700"
          >
            {row.businessName}
          </Link>
          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            {row.host}
            <a href={`https://${row.host}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
            </a>
            {row.status !== 'ACTIVE' && (
              <span className="text-amber-700 font-semibold">{row.status}</span>
            )}
          </div>
        </td>

        <td className="py-3 pr-3 text-sm">
          {configured ? (
            <div className="space-y-0.5">
              {row.conversionId && (
                <div className="flex items-center gap-1.5 text-gray-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  Google{row.hasLeadConversion ? ' · form' : ''}
                  {row.hasCallConversion ? ' · calls' : ''}
                </div>
              )}
              {row.bingTagId && (
                <div className="flex items-center gap-1.5 text-gray-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  Microsoft
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-gray-400">
              <MinusCircle className="h-3.5 w-3.5" /> Nothing configured
            </span>
          )}
        </td>

        {showLeads && (
          <td className="py-3 pr-3 text-sm whitespace-nowrap">
            <span className="font-semibold text-gray-900">{row.leads30d}</span>
            <span className="text-gray-400"> · {timeAgo(row.lastLeadAt)}</span>
          </td>
        )}

        <td className="py-3 text-sm">
          {s?.running ? (
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </span>
          ) : s?.error ? (
            <span className="text-red-600">{s.error}</span>
          ) : v ? (
            v.failed === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> All {v.total} checks pass
              </span>
            ) : (
              <div className="text-red-700">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <XCircle className="h-3.5 w-3.5" />
                  {v.failed} of {v.total} failing
                </span>
                <div className="text-xs text-gray-600">
                  {v.first?.label}: {v.first?.detail}
                </div>
              </div>
            )
          ) : configured ? (
            <button
              type="button"
              onClick={() => check(row)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Check
            </button>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div>
            <h2 className="font-bold text-gray-900">Managed ads</h2>
            <p className="text-sm text-gray-500">
              You run these. A broken tag here is spend with nothing to optimise against.
            </p>
          </div>
          <button
            type="button"
            onClick={() => checkAll(managed)}
            disabled={runningAll || managed.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {runningAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Stethoscope className="h-4 w-4" />
            )}
            Check all
          </button>
        </div>
        {managed.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            No client has a Google Ads account selected yet. Pick one on a client&apos;s
            Advertising tab — only accounts under your manager account appear there.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="pb-2 font-semibold">Client</th>
                <th className="pb-2 font-semibold">Configured</th>
                <th className="pb-2 font-semibold">Live check</th>
              </tr>
            </thead>
            <tbody>
              {managed.map((row) => (
                <Row key={row.id} row={row} showLeads={false} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <h2 className="font-bold text-gray-900">Self-serve</h2>
        </div>
        <p className="text-sm text-gray-500 mb-2">
          You don&apos;t run their ads, so tracking here is theirs to get right. Sorted by leads
          in the last 30 days — the ones at the top are already proving the site works, which is
          the whole pitch for managing their ads.
        </p>
        {selfServe.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Every client is on managed ads.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="pb-2 font-semibold">Client</th>
                <th className="pb-2 font-semibold">Configured</th>
                <th className="pb-2 font-semibold">Leads (30d)</th>
                <th className="pb-2 font-semibold">Live check</th>
              </tr>
            </thead>
            <tbody>
              {selfServe.map((row) => (
                <Row key={row.id} row={row} showLeads />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
