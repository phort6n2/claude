'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  FLAG_LABELS,
  FULL_SPEND_SHARE,
  UNDERSPEND_SHARE,
  applyRefusal,
  biddingLabel,
  suggestionBelowTarget,
  type Flag,
  type FullSpend,
  type TcpaRow,
} from '@/lib/target-cpa'
import { money, shortDate, conv } from './campaign-report-ui'

/**
 * The Target CPA panel. A TABLE from `lg` up, CARDS below it — the owner's
 * rule for this app is no table that scrolls both ways on a phone, and eleven
 * columns cannot fit one any other way. Both views read the same rows and the
 * same expanded detail, so they cannot disagree.
 */

export interface ChangeEntry {
  id: string
  createdAt: string
  userEmail: string
  customerId: string
  accountName: string
  campaignId: string
  campaignName: string
  scope: string
  oldMicros: number | null
  newMicros: number
  readBackMicros: number | null
  affectedCampaigns: number
  status: string
  error: string | null
}

interface Props {
  builtAt: string | null
  trigger: string | null
  durationMs: number | null
  rows: TcpaRow[]
  errors: Array<{ name: string; error: string }>
  accountCount: number
  changes: ChangeEntry[]
  applyEnabled: boolean
  /** The read this page made on its own when it had nothing current, if it failed. */
  autoError?: string | null
}

const pctText = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  })
}

function range(a: string, b: string): string {
  return `${shortDate(a)}–${shortDate(b)}`
}

function fullSpendText(f: FullSpend, r: TcpaRow): string {
  if (r.bidding === 'MAX_CLICKS') return '—'
  if (f.kind === 'target') return money(f.micros, r.currency)
  if (f.kind === 'already') return 'Already spends budget'
  if (f.kind === 'above') return `Above ${money(f.highestMicros, r.currency)} (Google's highest point)`
  return 'No simulation (new campaign or not enough data)'
}

function targetText(r: TcpaRow): string {
  if (r.bidding === 'MAX_CLICKS') return 'Max Clicks'
  return r.targetMicros == null ? 'No target' : money(r.targetMicros, r.currency)
}

const FLAG_STYLE: Record<Flag, string> = {
  'bid-limited': 'bg-red-50 text-red-700 ring-red-200',
  'budget-limited': 'bg-amber-50 text-amber-800 ring-amber-200',
  learning: 'bg-blue-50 text-blue-700 ring-blue-200',
}

function Flags({ r }: { r: TcpaRow }) {
  if (r.flags.length === 0 && !r.underspending) return <span className="text-xs text-gray-400">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {r.underspending && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Underspending</span>
      )}
      {r.flags.map((f) => (
        <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${FLAG_STYLE[f]}`}>
          {FLAG_LABELS[f]}
        </span>
      ))}
    </div>
  )
}

function Spend({ r }: { r: TcpaRow }) {
  if (r.avgDailySpendMicros == null) return <span className="text-gray-400">—</span>
  const low = r.spendPct != null && r.spendPct < UNDERSPEND_SHARE
  return (
    <span>
      <span className="tabular-nums">{money(r.avgDailySpendMicros, r.currency)}</span>{' '}
      <span className={`tabular-nums ${low ? 'font-semibold text-red-700' : 'text-gray-500'}`}>({pctText(r.spendPct)})</span>
      {r.budgetShared && <span className="block text-[11px] text-gray-500">shared budget</span>}
    </span>
  )
}

function Suggested({ r }: { r: TcpaRow }) {
  if (r.suggestedMicros == null) return <>—</>
  return (
    <span>
      {money(r.suggestedMicros, r.currency)}
      {suggestionBelowTarget(r) && (
        <span className="block text-[11px] font-normal text-gray-500">below current — not the limit</span>
      )}
    </span>
  )
}

function AsOf({ r, builtAt }: { r: TcpaRow; builtAt: string }) {
  return (
    <span className="text-[11px] text-gray-500">
      as of {shortDate(builtAt.slice(0, 10))}
      {r.simulation ? ` · sim ${range(r.simulation.startDate, r.simulation.endDate)}` : ' · no simulation'}
    </span>
  )
}

function Detail({
  r,
  builtAt,
  applyEnabled,
  onApply,
  lastChange,
}: {
  r: TcpaRow
  builtAt: string
  applyEnabled: boolean
  onApply: (r: TcpaRow) => void
  lastChange: ChangeEntry | undefined
}) {
  const refusal = applyRefusal(r)
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-gray-600">
        Data as of {when(builtAt)}.{' '}
        {r.simulation
          ? `Google's simulation covers ${range(r.simulation.startDate, r.simulation.endDate)}; its spend is that period's total divided by its days.`
          : 'Google has no target CPA simulation for this campaign (new, or not enough data).'}{' '}
        &ldquo;Full spend&rdquo; is {Math.round(FULL_SPEND_SHARE * 100)}% of the daily budget
        {r.budgetShared ? ', less what the other campaigns on this shared budget already spend' : ''}
        {r.thresholdMicros != null ? ` — ${money(r.thresholdMicros, r.currency)}/day` : ''}.
      </p>

      {r.portfolio && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          On the shared bid strategy <strong>{r.portfolio.name || r.portfolio.resourceName}</strong>, used by{' '}
          {r.portfolio.campaignCount} campaign{r.portfolio.campaignCount === 1 ? '' : 's'}. Its target is the strategy&apos;s.
        </p>
      )}

      {r.simulation && r.simulation.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-4 font-medium">Target</th>
                <th className="py-1 pr-4 font-medium">Daily spend</th>
                <th className="py-1 pr-4 font-medium">Conv./day</th>
                <th className="py-1 font-medium">Required budget</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.simulation.rows.map((p) => {
                const hits = r.thresholdMicros != null && p.dailySpendMicros >= r.thresholdMicros
                const current = r.targetMicros != null && Math.abs(p.targetMicros - r.targetMicros) < 5_000
                return (
                  <tr key={p.targetMicros} className={`border-t border-gray-100 ${current ? 'bg-blue-50' : ''}`}>
                    <td className="py-1 pr-4">
                      {money(p.targetMicros, r.currency)}
                      {current && <span className="ml-1 text-[10px] text-blue-700">current</span>}
                    </td>
                    <td className={`py-1 pr-4 ${hits ? 'font-semibold text-green-700' : ''}`}>
                      {money(p.dailySpendMicros, r.currency)}
                    </td>
                    <td className="py-1 pr-4">{conv(Math.round(p.dailyConversions * 100) / 100)}</td>
                    <td className="py-1">{p.requiredBudgetMicros == null ? '—' : money(p.requiredBudgetMicros, r.currency)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">
          Spend by day, {range(r.window.start, r.window.end)} ({r.enabledDays} enabled day{r.enabledDays === 1 ? '' : 's'})
        </p>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] tabular-nums">
          {r.spendByDay.map((d) => (
            <div key={d.date} className="rounded bg-gray-50 px-1 py-1">
              <div className="text-gray-500">{shortDate(d.date)}</div>
              <div className="text-gray-900">{money(d.costMicros, r.currency, true)}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-600">
        30 days: {money(r.cost30Micros, r.currency, true)} spent, {conv(Math.round(r.conversions30 * 100) / 100)} conversions.
        {r.google && ` Google's suggestion is from a ${r.google.type.toLowerCase().replace(/_/g, ' ')} recommendation.`}
        {r.note && ` ${r.note}`}
      </p>

      {lastChange && (
        <p className="text-xs text-gray-700">
          Last change: {lastChange.oldMicros == null ? 'none' : money(lastChange.oldMicros, r.currency)} →{' '}
          {money(lastChange.newMicros, r.currency)} on {when(lastChange.createdAt)} ({lastChange.status}
          {lastChange.readBackMicros != null ? `, Google now reads ${money(lastChange.readBackMicros, r.currency)}` : ''}).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {applyEnabled && r.bidding === 'MAX_CONV' && (
          <button
            type="button"
            disabled={!!refusal}
            onClick={() => onApply(r)}
            title={refusal || undefined}
            className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            Apply suggested target{r.suggestedMicros != null ? ` (${money(r.suggestedMicros, r.currency)})` : ''}
          </button>
        )}
        {applyEnabled && r.bidding === 'MAX_CONV' && refusal && <span className="text-xs text-gray-500">{refusal}</span>}
        {r.clientId && (
          <Link
            href={`/admin/clients/${r.clientId}/advertising`}
            className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            Client page
          </Link>
        )}
      </div>
    </div>
  )
}

function ConfirmDialog({
  r,
  onClose,
  onDone,
}: {
  r: TcpaRow
  onClose: () => void
  onDone: (message: string, ok: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const to = r.suggestedMicros as number

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/target-cpa/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: r.customerId,
          campaignId: r.campaignId,
          fromMicros: r.targetMicros,
          toMicros: to,
          scope: r.portfolio ? 'portfolio' : 'campaign',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setError(data.error || `Failed (HTTP ${res.status})`)
        setBusy(false)
        return
      }
      onDone(
        data.status === 'applied'
          ? `${r.campaignName}: target is now ${money(data.readBackMicros, r.currency)} (read back from Google).`
          : `${r.campaignName}: Google accepted the change but the read-back said ${data.readBackMicros == null ? 'nothing' : money(data.readBackMicros, r.currency)}. Check it in Google Ads.`,
        data.status === 'applied'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tcpa-confirm-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="tcpa-confirm-title" className="text-base font-semibold text-gray-900">
            Change the target CPA?
          </h2>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {r.accountName} · {r.campaignName}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 rounded-xl bg-gray-50 py-4 text-lg tabular-nums">
          <span className="text-gray-500">{r.targetMicros == null ? 'No target' : money(r.targetMicros, r.currency)}</span>
          <span className="text-gray-400">→</span>
          <span className="font-semibold text-gray-900">{money(to, r.currency)}</span>
        </div>
        {r.portfolio && (
          <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              This changes the shared bid strategy <strong>{r.portfolio.name || 'portfolio'}</strong>, which affects{' '}
              <strong>every campaign using it</strong> ({r.portfolio.campaignCount}). It is refused if any of them is not an AGMP campaign.
            </span>
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Google checks it first without saving (validate only), then it is sent for real and read back. Only the target CPA changes — never the budget or the bidding type. The change is logged with your name.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? 'Applying…' : `Set ${money(to, r.currency)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TargetCpaPanel({ builtAt, trigger, durationMs, rows, errors, accountCount, changes, applyEnabled, autoError }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<TcpaRow | null>(null)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [onlyUnder, setOnlyUnder] = useState(false)

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/admin/target-cpa/refresh', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) setRefreshError(data.error || `Refresh failed (HTTP ${res.status})`)
      router.refresh()
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const lastChange = new Map<string, ChangeEntry>()
  for (const c of changes) {
    const key = `${c.customerId}:${c.campaignId}`
    if (!lastChange.has(key) && c.status !== 'refused') lastChange.set(key, c)
  }

  const under = rows.filter((r) => r.underspending).length
  const shown = onlyUnder ? rows.filter((r) => r.underspending) : rows

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Target CPA vs Google</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every enabled AGMP campaign beside the target Google&apos;s simulation says would spend its budget. Underspending
            means under {Math.round(UNDERSPEND_SHARE * 100)}% of the daily budget over the last 7 days, on Maximize Conversions,
            running a week or more.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {builtAt
              ? `Data as of ${when(builtAt)} (${trigger === 'cron' ? 'morning run' : trigger === 'auto' ? 'read when this page opened' : 'refreshed by hand'}, ${accountCount} accounts${durationMs != null ? `, ${(durationMs / 1000).toFixed(1)}s` : ''}). Runs daily at 6:20 am Eastern.`
              : 'No snapshot yet. It runs daily at 6:20 am Eastern, or press Refresh now.'}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
          {refreshing ? 'Reading every account…' : 'Refresh now'}
        </button>
      </div>

      {refreshError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{refreshError}</p>}
      {autoError && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not read the accounts: {autoError}</p>
      )}
      {notice && (
        <p className={`mt-3 rounded-lg p-3 text-sm ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
          {notice.text}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className={`text-sm font-semibold ${under ? 'text-red-700' : 'text-green-700'}`}>
            {under === 0 ? 'Nothing underspending.' : `${under} campaign${under === 1 ? '' : 's'} underspending.`}
          </p>
          {under > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={onlyUnder} onChange={(e) => setOnlyUnder(e.target.checked)} className="h-4 w-4" />
              Only underspending
            </label>
          )}
          {!applyEnabled && <span className="text-xs text-gray-500">Applying targets is off (TARGET_CPA_APPLY_ENABLED).</span>}
        </div>
      )}

      {/* Phones and tablets: one card per campaign, nothing to scroll sideways. */}
      {builtAt && (
        <ul className="mt-4 space-y-2 lg:hidden">
          {shown.map((r) => {
            const isOpen = open.has(r.key)
            return (
              <li key={r.key} className={`rounded-xl border bg-white ${r.underspending ? 'border-red-300' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => toggle(r.key)}
                  aria-expanded={isOpen}
                  className="w-full px-3 pb-3 pt-2 text-left"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-gray-500">
                        {r.accountName} · {r.currency}
                      </p>
                      <p className="truncate text-[15px] font-semibold text-gray-900">{r.campaignName}</p>
                      <AsOf r={r} builtAt={builtAt} />
                    </div>
                    <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-gray-500">7-day avg / budget</dt>
                      <dd>
                        <Spend r={r} /> <span className="text-xs text-gray-500">of {r.budgetMicros == null ? '—' : money(r.budgetMicros, r.currency)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">My target · {biddingLabel(r.biddingType)}</dt>
                      <dd className="tabular-nums">{targetText(r)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Full-spend target</dt>
                      <dd className="tabular-nums">{fullSpendText(r.fullSpend, r)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Suggested .77</dt>
                      <dd className="font-semibold tabular-nums"><Suggested r={r} /></dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Google&apos;s suggestion</dt>
                      <dd className="tabular-nums">{r.google ? money(r.google.micros, r.currency) : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">30-day cost / conv.</dt>
                      <dd className="tabular-nums">{r.cpa30Micros == null ? '—' : money(r.cpa30Micros, r.currency)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2">
                    <Flags r={r} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-3 py-3">
                    <Detail r={r} builtAt={builtAt} applyEnabled={applyEnabled} onApply={setConfirm} lastChange={lastChange.get(r.key)} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Wide screens: the table. */}
      {builtAt && shown.length > 0 && (
        <div className="mt-4 hidden overflow-hidden rounded-xl border border-gray-200 bg-white lg:block">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[15%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Bidding</th>
                <th className="px-3 py-2 text-right font-medium">Daily budget</th>
                <th className="px-3 py-2 text-right font-medium">7-day avg spend</th>
                <th className="px-3 py-2 text-right font-medium">My target</th>
                <th className="px-3 py-2 text-right font-medium">Full-spend target</th>
                <th className="px-3 py-2 text-right font-medium">Google&apos;s suggestion</th>
                <th className="px-3 py-2 text-right font-medium">Suggested .77</th>
                <th className="px-3 py-2 text-right font-medium">30-day CPA</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = open.has(r.key)
                return (
                  <FragmentRow key={r.key}>
                    <tr
                      onClick={() => toggle(r.key)}
                      className={`cursor-pointer border-t border-gray-100 align-top hover:bg-gray-50 ${r.underspending ? 'bg-red-50/40' : ''}`}
                      aria-expanded={isOpen}
                    >
                      <td className="px-3 py-2">
                        <span className="block break-words font-medium text-gray-900">{r.accountName}</span>
                        <span className="text-[11px] text-gray-500">{r.currency}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-start gap-1">
                          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                          <span className="min-w-0 break-words text-gray-900">{r.campaignName}</span>
                        </span>
                        <AsOf r={r} builtAt={builtAt} />
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {biddingLabel(r.biddingType)}
                        {r.portfolio && <span className="block text-[11px] text-amber-700">shared strategy</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.budgetMicros == null ? '—' : money(r.budgetMicros, r.currency)}</td>
                      <td className="px-3 py-2 text-right"><Spend r={r} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{targetText(r)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">{fullSpendText(r.fullSpend, r)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.google ? money(r.google.micros, r.currency) : ''}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums"><Suggested r={r} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.cpa30Micros == null ? '—' : money(r.cpa30Micros, r.currency)}</td>
                      <td className="px-3 py-2"><Flags r={r} /></td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-gray-100 bg-gray-50/60">
                        <td colSpan={11} className="px-6 py-4">
                          <Detail r={r} builtAt={builtAt} applyEnabled={applyEnabled} onApply={setConfirm} lastChange={lastChange.get(r.key)} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {builtAt && rows.length === 0 && errors.length === 0 && (
        <p className="mt-6 rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500">No enabled AGMP campaigns in any account.</p>
      )}

      {errors.length > 0 && (
        <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-800">Could not fully read {errors.length} account{errors.length === 1 ? '' : 's'}</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {errors.map((e) => (
              <li key={e.name} className="break-words">
                <strong>{e.name}:</strong> {e.error}
              </li>
            ))}
          </ul>
        </section>
      )}

      {changes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900">Changes made here</h2>
          <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
            {changes.map((c) => (
              <li key={c.id} className="px-3 py-2">
                <span className="text-gray-900">
                  {c.accountName} · {c.campaignName}
                  {c.scope === 'portfolio' ? ` (shared strategy, ${c.affectedCampaigns} campaigns)` : ''}
                </span>
                <span className="block text-xs text-gray-500">
                  {when(c.createdAt)} · {c.userEmail} · {c.oldMicros == null ? 'none' : (c.oldMicros / 1e6).toFixed(2)} →{' '}
                  {(c.newMicros / 1e6).toFixed(2)} · <strong className={c.status === 'applied' ? 'text-green-700' : 'text-red-700'}>{c.status}</strong>
                  {c.readBackMicros != null ? ` · read back ${(c.readBackMicros / 1e6).toFixed(2)}` : ''}
                  {c.error ? ` · ${c.error}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirm && (
        <ConfirmDialog
          r={confirm}
          onClose={() => setConfirm(null)}
          onDone={(text, ok) => {
            setConfirm(null)
            setNotice({ text, ok })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
