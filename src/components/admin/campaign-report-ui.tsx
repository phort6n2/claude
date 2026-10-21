'use client'

import { createContext, useContext } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, TriangleAlert, CircleAlert, Gauge } from 'lucide-react'
import {
  change,
  targetAdvice,
  targetLabel,
  type CampaignIssue,
  type ReportAccount,
  type ReportCampaign,
  type TargetHint,
  type Totals,
} from '@/lib/campaign-report'
import type { ApplyTarget } from './ApplyTargetDialog'

export interface Row {
  c: ReportCampaign
  t: Totals
  issues: CampaignIssue[]
}

/** One account as every view of the report sees it. */
export interface AccountView {
  a: ReportAccount
  rows: Row[]
  total: Totals
  prior: Totals
  budget: number | null
  flagged: number
  idle: boolean
  suspended: boolean
}

/** Formatting and small pieces shared by the campaign table, the phone cards
 *  and the quick screens — one money format, so the three cannot disagree. */

export function money(micros: number, currency: string, whole = false): string {
  const v = micros / 1_000_000
  const places = whole || v >= 1000 ? 0 : 2
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: places,
      minimumFractionDigits: places,
    }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}
export const int = (v: number) => Math.round(v).toLocaleString('en-US')
// Google reports fractional conversions (data-driven attribution); it shows
// two places, and rounding 0.99 to "1" here would disagree with its own app.
export const conv = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
export const pct = (r: number | null) => (r == null ? '—' : `${(r * 100).toFixed(2)}%`)

export function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Cost summed per currency — a CAD account and a USD account do not add. */
export function byCurrency(entries: Array<{ currency: string; micros: number }>): string {
  const sums = new Map<string, number>()
  for (const e of entries) sums.set(e.currency, (sums.get(e.currency) || 0) + e.micros)
  if (sums.size === 0) return '—'
  // Whole units: a scorecard holding two currencies has room for no cents.
  return [...sums.entries()].map(([c, m]) => money(m, c, true)).join(' · ')
}

/** Cost per conversion per currency, for the same reason. */
export function perConvByCurrency(entries: Array<{ currency: string; micros: number; conv: number }>): string {
  const sums = new Map<string, { micros: number; conv: number }>()
  for (const e of entries) {
    const s = sums.get(e.currency) || { micros: 0, conv: 0 }
    sums.set(e.currency, { micros: s.micros + e.micros, conv: s.conv + e.conv })
  }
  const parts = [...sums.entries()].filter(([, v]) => v.conv > 0)
  if (parts.length === 0) return '—'
  return parts.map(([c, v]) => money(v.micros / v.conv, c)).join(' · ')
}

export function Change({ now, before }: { now: number; before: number }) {
  const c = change(now, before)
  if (c == null) return <span className="text-xs text-gray-500">no prior data</span>
  const up = c >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  // Neutral grey on purpose: cost up is not good or bad on its own, and a
  // red arrow on every figure that moved is noise.
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500"
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(c * 100).toFixed(0)}% on the period before`}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(c * 100).toFixed(0)}%
    </span>
  )
}

export function Scorecard({
  label,
  value,
  sub,
  now,
  before,
  compare,
  className = '',
}: {
  label: string
  value: string
  /** A second currency, small, under the first — "CA$642 · $7,308" in one
   *  line wrapped badly on a phone. */
  sub?: string
  now?: number
  before?: number
  compare: boolean
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white px-3 py-2.5 ${className}`}>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 break-words text-lg font-semibold leading-tight text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] font-medium text-gray-500 tabular-nums">{sub}</div>}
      {compare && now != null && before != null && (
        <div className="mt-0.5">
          <Change now={now} before={before} />
        </div>
      )}
    </div>
  )
}

/** Per-currency amounts, largest first, so the main one can be shown big. */
export function currencyParts(entries: Array<{ currency: string; micros: number }>): string[] {
  const sums = new Map<string, number>()
  for (const e of entries) sums.set(e.currency, (sums.get(e.currency) || 0) + e.micros)
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([c, m]) => money(m, c, true))
}

/** Cost per conversion per currency, largest spend first. */
export function perConvParts(entries: Array<{ currency: string; micros: number; conv: number }>): string[] {
  const sums = new Map<string, { micros: number; conv: number }>()
  for (const e of entries) {
    const s = sums.get(e.currency) || { micros: 0, conv: 0 }
    sums.set(e.currency, { micros: s.micros + e.micros, conv: s.conv + e.conv })
  }
  return [...sums.entries()]
    .filter(([, v]) => v.conv > 0)
    .sort((a, b) => b[1].micros - a[1].micros)
    .map(([c, v]) => money(v.micros / v.conv, c))
}

export function IssueChip({ issue }: { issue: CampaignIssue }) {
  const bad = issue.severity === 'bad'
  const Icon = bad ? CircleAlert : TriangleAlert
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        bad ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {issue.label}
    </span>
  )
}


/**
 * Whether this screen may APPLY a suggested target, and how to ask. Provided
 * by the campaign report (true only for the owner, with
 * TARGET_CPA_APPLY_ENABLED on); absent, the "try $X" mark is just a link.
 * A context rather than a prop because the mark sits four components down,
 * in the phone cards and in the table alike.
 */
export const TargetApplyContext = createContext<{ canApply: boolean; ask: (t: ApplyTarget) => void } | null>(null)

/**
 * The bidding line under a campaign's name — "Max Conv. · target $29.77" —
 * and, when the Target CPA panel would raise it, a link there saying so,
 * plus a "Set" button where applying is switched on. The cards and the table
 * both draw this, so the two cannot describe one campaign differently.
 */
export function TargetLine({
  c,
  hint,
  currency,
  account,
}: {
  c: ReportCampaign
  hint?: TargetHint
  currency: string
  account: { customerId: string; name: string }
}) {
  const apply = useContext(TargetApplyContext)
  const label = targetLabel(c, hint)
  const advice = targetAdvice(c, hint)
  if (!label && !advice) return null
  const text =
    label?.kind === 'max-clicks'
      ? 'Max Clicks'
      : label?.kind === 'max-conv'
        ? `Max Conv. · ${label.micros == null ? 'no target' : `target ${money(label.micros, currency)}`}${label.portfolio ? ' (shared)' : ''}`
        : label?.kind === 'target-cpa'
          ? `Target CPA ${label.micros == null ? '—' : money(label.micros, currency)}`
          : null
  return (
    <div className="mt-0.5">
      {text && <div className="text-[11px] text-gray-500">{text}</div>}
      {advice && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Link
            href="/admin/target-cpa"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
            title={`Underspending${hint?.spendPct != null ? ` (${Math.round(hint.spendPct * 100)}% of budget, last 7 days)` : ''}. Google's simulation says this target would spend the budget.`}
          >
            <Gauge className="h-3 w-3" aria-hidden />
            Target too low · try {money(advice.suggestedMicros, currency)}
          </Link>
          {apply?.canApply && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                apply.ask({
                  customerId: account.customerId,
                  campaignId: c.id,
                  accountName: account.name,
                  campaignName: c.name,
                  currency,
                  // What the snapshot read — the server refuses if Google's live target is no longer this.
                  fromMicros: hint?.snapshotTargetMicros ?? null,
                  toMicros: advice.suggestedMicros,
                  portfolio: hint?.portfolio
                    ? { name: hint.portfolioName || '', campaignCount: hint.portfolioCampaigns || 0 }
                    : null,
                })
              }}
              className="inline-flex h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Set {money(advice.suggestedMicros, currency)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
