'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, RefreshCw, TriangleAlert, CircleAlert, X } from 'lucide-react'
import {
  RANGES,
  ZERO,
  DEFAULT_RANGE,
  DEFAULT_SORT,
  isSortState,
  nextSort,
  sortRows,
  sortValue,
  addTotals,
  accountBudgetMicros,
  campaignIssues,
  change,
  convRate,
  costPerConv,
  isIdle,
  isRangeId,
  previousWindow,
  rangeWindow,
  statusLabel,
  visibleCampaigns,
  worstSeverity,
  type CampaignIssue,
  type CampaignReportData,
  type RangeId,
  type SortKey,
  type SortState,
  type ReportAccount,
  type ReportCampaign,
  type Totals,
} from '@/lib/campaign-report'
import { errorFrom } from '@/lib/http-error'

/**
 * The Google Ads campaign table, every account at once, on the admin home.
 * Shaped like Google's own app so it reads without learning: a range picker,
 * scorecards, then one row per campaign. The rows that need a look are marked
 * — see `campaign-report.ts` for what earns a mark and why so little does.
 *
 * Switching range never refetches: sixty days per campaign come down once and
 * every range is summed here, so the pills answer as fast as they are tapped.
 */

const STORAGE_KEY = 'admin-campaign-range'
const SORT_STORAGE_KEY = 'admin-campaign-sort'

function money(micros: number, currency: string, whole = false): string {
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
const int = (v: number) => Math.round(v).toLocaleString('en-US')
// Google reports fractional conversions (data-driven attribution); it shows
// two places, and rounding 0.99 to "1" here would disagree with its own app.
const conv = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const pct = (r: number | null) => (r == null ? '—' : `${(r * 100).toFixed(2)}%`)

function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Cost summed per currency — a CAD account and a USD account do not add. */
function byCurrency(entries: Array<{ currency: string; micros: number }>): string {
  const sums = new Map<string, number>()
  for (const e of entries) sums.set(e.currency, (sums.get(e.currency) || 0) + e.micros)
  if (sums.size === 0) return '—'
  // Whole units: a scorecard holding two currencies has room for no cents.
  return [...sums.entries()].map(([c, m]) => money(m, c, true)).join(' · ')
}

/** Cost per conversion per currency, for the same reason. */
function perConvByCurrency(entries: Array<{ currency: string; micros: number; conv: number }>): string {
  const sums = new Map<string, { micros: number; conv: number }>()
  for (const e of entries) {
    const s = sums.get(e.currency) || { micros: 0, conv: 0 }
    sums.set(e.currency, { micros: s.micros + e.micros, conv: s.conv + e.conv })
  }
  const parts = [...sums.entries()].filter(([, v]) => v.conv > 0)
  if (parts.length === 0) return '—'
  return parts.map(([c, v]) => money(v.micros / v.conv, c)).join(' · ')
}

function Change({ now, before }: { now: number; before: number }) {
  const c = change(now, before)
  if (c == null) return <span className="text-xs text-gray-400">no prior data</span>
  const up = c >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  // Neutral grey on purpose: cost up is not good or bad on its own, and a
  // red arrow on every figure that moved is noise.
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500">
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(c * 100).toFixed(0)}%
    </span>
  )
}

function Scorecard({
  label,
  value,
  now,
  before,
  compare,
}: {
  label: string
  value: string
  now?: number
  before?: number
  compare: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 break-words text-lg font-semibold leading-tight text-gray-900">{value}</div>
      {compare && now != null && before != null && (
        <div className="mt-0.5">
          <Change now={now} before={before} />
        </div>
      )}
    </div>
  )
}

function IssueChip({ issue }: { issue: CampaignIssue }) {
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

const NUM = 'whitespace-nowrap px-3 py-2 text-right tabular-nums'
/* The name column is CAPPED, not sized to its content: uncapped, one long
   account name took the whole of a 390px screen and every number started
   off the edge. Names wrap to two lines instead. */
const STICKY_COL = 'sticky left-0 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] sm:w-auto sm:min-w-[12rem] sm:max-w-[18rem]'
const STICKY = `${STICKY_COL} z-10`
/* The column headings stay on screen while the rows scroll. The table box
   scrolls BOTH ways for that (a box that scrolls sideways is already a scroll
   container, so a sticky heading can only stick inside it), capped near a
   screen's height. The line under the headings is a shadow, because a
   border on the row does not travel with a sticky cell. */
const HEAD = 'sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]'

function MetricCells({
  t,
  budget,
  currency,
  strong,
}: {
  t: Totals
  budget: string
  currency: string
  strong?: boolean
}) {
  const cls = `${NUM} ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'}`
  return (
    <>
      <td className={cls}>{budget}</td>
      <td className={cls}>{money(t.costMicros, currency)}</td>
      <td className={cls}>{int(t.impressions)}</td>
      <td className={cls}>{int(t.clicks)}</td>
      <td className={cls}>{conv(t.conversions)}</td>
      <td className={cls}>{costPerConv(t) == null ? '—' : money(costPerConv(t) as number, currency)}</td>
      <td className={cls}>{pct(convRate(t))}</td>
      <td className={cls}>{int(t.calls)}</td>
    </>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  first,
}: {
  label: string
  k: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  first?: boolean
}) {
  const active = sort.key === k
  const Icon = sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={
        first
          ? `${STICKY_COL} top-0 z-30 bg-white px-3 py-2 text-left shadow-[inset_0_-1px_0_#e5e7eb]`
          : `${NUM} ${HEAD}`
      }
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 ${first ? '' : 'flex-row-reverse'} ${
          active ? 'text-gray-900' : 'hover:text-gray-800'
        }`}
      >
        {label}
        {/* A fixed-width slot, so the column does not jump when the arrow
            appears on it. */}
        <span className="inline-block w-3.5">{active && <Icon className="h-3.5 w-3.5" />}</span>
      </button>
    </th>
  )
}

interface Row {
  c: ReportCampaign
  t: Totals
  issues: CampaignIssue[]
}

export default function CampaignReport({
  initial,
  initialRange,
}: {
  initial: CampaignReportData
  initialRange: RangeId | null
}) {
  const [data, setData] = useState(initial)
  const [range, setRange] = useState<RangeId>(initialRange ?? DEFAULT_RANGE)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  /** One account isolated (by customer id), or every account. */
  const [focus, setFocus] = useState<string | null>(null)

  // The last sort this browser chose, and an isolated account from the URL
  // (so the phone's back button and a shared link both keep it).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || 'null')
      if (isSortState(saved)) setSort(saved)
    } catch {
      /* the default is fine */
    }
    try {
      const account = new URL(window.location.href).searchParams.get('account')
      if (account) setFocus(account)
    } catch {
      /* ignore */
    }
  }, [])

  function sortBy(key: SortKey) {
    const next = nextSort(sort, key)
    setSort(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function isolate(customerId: string | null) {
    setFocus(customerId)
    setOpen(null)
    try {
      const url = new URL(window.location.href)
      if (customerId) url.searchParams.set('account', customerId)
      else url.searchParams.delete('account')
      window.history.replaceState(null, '', url)
    } catch {
      /* ignore */
    }
  }

  // The URL wins (a shared link means that range); otherwise the last range
  // this browser picked. Read after mount so the server render matches.
  useEffect(() => {
    if (initialRange) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (isRangeId(saved)) setRange(saved)
    } catch {
      /* private window — the default is fine */
    }
  }, [initialRange])

  function pick(r: RangeId) {
    setRange(r)
    setOpen(null)
    try {
      localStorage.setItem(STORAGE_KEY, r)
    } catch {
      /* ignore */
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('range', r)
      window.history.replaceState(null, '', url)
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/admin/campaign-report?fresh=1', { cache: 'no-store' })
      if (!res.ok) throw new Error(await errorFrom(res))
      setData(await res.json())
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Could not refresh')
    } finally {
      setRefreshing(false)
    }
  }

  const compare = range !== 'today'

  const view = useMemo(() => {
    const all = data.accounts.map((a) => {
      const w = rangeWindow(range, a.today)
      const pw = previousWindow(w)
      let rows: Row[] = visibleCampaigns(a, w).map(({ c, t }) => ({ c, t, issues: campaignIssues(c, t, range) }))
      const total = rows.reduce((s, r) => addTotals(s, r.t), ZERO)
      const prior = a.campaigns.reduce((s, c) => {
        let t = s
        for (const [d, m] of Object.entries(c.days)) {
          if (d >= pw.start && d <= pw.end)
            t = addTotals(t, {
              costMicros: m[0],
              impressions: m[1],
              clicks: m[2],
              interactions: m[3],
              conversions: m[4],
              calls: m[5],
            })
        }
        return t
      }, ZERO)
      const budget = accountBudgetMicros(a)
      // Campaigns follow the same heading; by name they keep their own order
      // (running first, biggest spend first), which is the useful default.
      if (sort.key !== 'name') {
        rows = sortRows(rows, sort, (r) => ({ name: r.c.name, value: sortValue(sort.key, r.t, r.c.budgetMicros) }))
      }
      const suspended = a.status === 'SUSPENDED'
      const flagged = rows.filter((r) => r.issues.length > 0).length + (suspended ? 1 : 0)
      return { a, w, rows, total, prior, budget, flagged, idle: isIdle(a), suspended }
    })

    // An isolated account is the WHOLE view: the scorecards, the count of
    // problems and the table all describe that one shop.
    const scope = focus ? all.filter((x) => x.a.customerId === focus) : all

    let now = ZERO
    let before = ZERO
    const cost: Array<{ currency: string; micros: number; conv: number }> = []
    const costBefore: Array<{ currency: string; micros: number; conv: number }> = []
    const budgets: Array<{ currency: string; micros: number }> = []
    let issueCount = 0
    for (const x of scope) {
      issueCount += x.flagged
      if (x.a.error) continue
      now = addTotals(now, x.total)
      before = addTotals(before, x.prior)
      cost.push({ currency: x.a.currency, micros: x.total.costMicros, conv: x.total.conversions })
      costBefore.push({ currency: x.a.currency, micros: x.prior.costMicros, conv: x.prior.conversions })
      if (x.budget != null) budgets.push({ currency: x.a.currency, micros: x.budget })
    }

    /* By name, the quiet accounts stay at the foot below the ones spending
       money; by a figure, the figure decides, blanks last. */
    const byName = (list: typeof scope) => sortRows(list, sort, (x) => ({ name: x.a.name, value: null }))
    const accounts =
      sort.key === 'name'
        ? [...byName(scope.filter((x) => !x.idle)), ...byName(scope.filter((x) => x.idle))]
        : sortRows(scope, sort, (x) => ({ name: x.a.name, value: sortValue(sort.key, x.total, x.budget) }))

    const sample = accounts.find((x) => !x.a.error)?.w ?? null
    const singleCurrency = new Set(cost.map((c) => c.currency)).size <= 1
    const focused = focus ? (all.find((x) => x.a.customerId === focus)?.a ?? null) : null
    return { accounts, now, before, cost, costBefore, budgets, issueCount, sample, singleCurrency, focused }
  }, [data, range, sort, focus])

  const shown = onlyIssues ? view.accounts.filter((x) => x.flagged > 0 || x.a.error) : view.accounts

  return (
    <section>
      {/* The range picker: all seven in ONE row at every width. A sideways
          scroller hid 14, 21 and 30 days off the edge of a 390px phone with
          nothing saying they were there, so a phone gets short labels in a
          seven-column grid instead. */}
      <div className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap sm:gap-2" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => pick(r.id)}
            aria-pressed={range === r.id}
            aria-label={r.label}
            className={`rounded-full border px-0.5 py-1.5 text-[11px] font-medium transition-colors min-[360px]:text-xs sm:px-3.5 sm:text-sm ${
              range === r.id
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="sm:hidden">{r.short}</span>
            <span className="hidden sm:inline">{r.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {view.sample &&
            (view.sample.start === view.sample.end
              ? shortDate(view.sample.start)
              : `${shortDate(view.sample.start)} – ${shortDate(view.sample.end)}`)}
          {view.sample && compare && (
            <>
              {' '}
              · compared with the {view.sample.days === 1 ? 'day' : `${view.sample.days} days`} before
            </>
          )}
          {range === 'today' && ' · Google’s figures for today run a few hours behind'}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing
            ? 'Refreshing…'
            : `Updated ${new Date(data.builtAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </button>
      </div>
      {refreshError && <p className="mt-1 text-xs text-red-600">{refreshError}</p>}

      {data.error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not read the Google Ads manager account: {data.error}
        </div>
      ) : (
        <>
          {focus && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
              <div className="min-w-0 text-sm text-blue-900">
                Showing only <span className="font-semibold">{view.focused?.name ?? 'an account no longer on the list'}</span>
                {view.focused?.clientId && (
                  <>
                    {' · '}
                    <Link href={`/admin/clients/${view.focused.clientId}/advertising`} className="underline hover:text-blue-700">
                      Client page
                    </Link>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => isolate(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <X className="h-3.5 w-3.5" />
                Show all accounts
              </button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Scorecard label="Daily budget" value={byCurrency(view.budgets)} compare={false} />
            <Scorecard
              label="Cost"
              value={byCurrency(view.cost)}
              // A change across currencies is only meaningful when there is one.
              now={view.singleCurrency ? view.now.costMicros : undefined}
              before={view.singleCurrency ? view.before.costMicros : undefined}
              compare={compare}
            />
            <Scorecard label="Impressions" value={int(view.now.impressions)} now={view.now.impressions} before={view.before.impressions} compare={compare} />
            <Scorecard label="Clicks" value={int(view.now.clicks)} now={view.now.clicks} before={view.before.clicks} compare={compare} />
            <Scorecard label="Conversions" value={conv(view.now.conversions)} now={view.now.conversions} before={view.before.conversions} compare={compare} />
            <Scorecard
              label="Cost / conv."
              value={perConvByCurrency(view.cost)}
              now={view.singleCurrency ? (costPerConv(view.now) ?? undefined) : undefined}
              before={view.singleCurrency ? (costPerConv(view.before) ?? undefined) : undefined}
              compare={compare}
            />
            <Scorecard
              label="Conv. rate"
              value={pct(convRate(view.now))}
              now={convRate(view.now) ?? undefined}
              before={convRate(view.before) ?? undefined}
              compare={compare}
            />
            <Scorecard label="Calls" value={int(view.now.calls)} now={view.now.calls} before={view.before.calls} compare={compare} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-700">
              {view.issueCount === 0 ? (
                <span className="text-emerald-700">No campaign needs a look in this period.</span>
              ) : (
                <span className="font-medium text-red-700">
                  {view.issueCount} campaign{view.issueCount === 1 ? '' : 's'} need{view.issueCount === 1 ? 's' : ''} a look
                </span>
              )}
            </p>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Only show problems
            </label>
          </div>

          {/* Wide content scrolls inside its own box; the page never does.
              The campaign column stays put so a number is never orphaned
              from the name it belongs to. */}
          <div className="mt-2 max-h-[75vh] overflow-auto overscroll-contain rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-500">
                  <SortHeader label="Campaign" k="name" sort={sort} onSort={sortBy} first />
                  <SortHeader label="Budget" k="budget" sort={sort} onSort={sortBy} />
                  <SortHeader label="Cost" k="cost" sort={sort} onSort={sortBy} />
                  <SortHeader label="Impr." k="impressions" sort={sort} onSort={sortBy} />
                  <SortHeader label="Clicks" k="clicks" sort={sort} onSort={sortBy} />
                  <SortHeader label="Conv." k="conversions" sort={sort} onSort={sortBy} />
                  <SortHeader label="Cost / conv." k="costPerConv" sort={sort} onSort={sortBy} />
                  <SortHeader label="Conv. rate" k="convRate" sort={sort} onSort={sortBy} />
                  <SortHeader label="Calls" k="calls" sort={sort} onSort={sortBy} />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ a, rows, total, budget, flagged, idle, suspended }) => (
                  <AccountRows
                    key={a.customerId}
                    a={a}
                    rows={onlyIssues ? rows.filter((r) => r.issues.length > 0) : rows}
                    total={total}
                    budget={budget}
                    flagged={flagged}
                    idle={idle}
                    suspended={suspended}
                    open={open}
                    setOpen={setOpen}
                    focused={focus === a.customerId}
                    onIsolate={() => isolate(focus === a.customerId ? null : a.customerId)}
                  />
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                      Nothing to show for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Every figure is Google’s own, in each account’s time zone, and ranges end yesterday as they do in Google Ads.
            Budget is per day. Cost / conv. is Google’s cost ÷ conversions. Conv. rate is conversions ÷ interactions. Calls are calls from the call button on the ads,
            as Google counts them — not every call to a shop’s tracking number. Tap a marked campaign for the reason, a heading to sort by it (again to reverse), and a shop’s name to see only that shop.
          </p>
        </>
      )}
    </section>
  )
}

function AccountRows({
  a,
  rows,
  total,
  budget,
  flagged,
  idle,
  suspended,
  open,
  setOpen,
  focused,
  onIsolate,
}: {
  a: ReportAccount
  rows: Row[]
  total: Totals
  budget: number | null
  flagged: number
  idle: boolean
  suspended: boolean
  open: string | null
  setOpen: (v: string | null) => void
  focused: boolean
  onIsolate: () => void
}) {
  /* The name ISOLATES the shop rather than leaving the page: on a phone this
     table is the whole app, and "just this one" is the question. The client
     page is one tap further, in the banner that appears. */
  const name = (
    <button
      type="button"
      onClick={onIsolate}
      aria-pressed={focused}
      className="text-left hover:text-blue-700 hover:underline"
      title={focused ? 'Show all accounts' : `Show only ${a.name}`}
    >
      {a.name}
    </button>
  )
  return (
    <>
      <tr className="border-t border-gray-200 bg-slate-50">
        <td className={`${STICKY} bg-slate-50 px-3 py-2`}>
          <div className="line-clamp-2 break-words font-semibold leading-snug text-gray-900">{name}</div>
          {suspended ? (
            <div className="text-[11px] font-medium text-red-700">Account suspended by Google</div>
          ) : (
            <div className="text-[11px] text-gray-500">
              {a.error
                ? 'Could not read'
                : idle
                  ? 'Nothing running in 60 days'
                  : `${rows.length} campaign${rows.length === 1 ? '' : 's'}${flagged ? ` · ${flagged} marked` : ''}`}
            </div>
          )}
        </td>
        {a.error ? (
          <td colSpan={8} className="px-3 py-2 text-xs text-red-700">
            {a.error}
          </td>
        ) : (
          <MetricCells
            t={total}
            budget={budget == null ? '—' : `${money(budget, a.currency)}/day`}
            currency={a.currency}
            strong
          />
        )}
      </tr>
      {!a.error &&
        rows.map(({ c, t, issues }) => {
          const key = `${a.customerId}:${c.id}`
          const sev = worstSeverity(issues)
          const isOpen = open === key
          return (
            <Fragment key={key}>
              <tr
                className={`border-t border-gray-100 ${issues.length ? 'cursor-pointer' : ''}`}
                onClick={issues.length ? () => setOpen(isOpen ? null : key) : undefined}
                aria-expanded={issues.length ? isOpen : undefined}
              >
                <td
                  className={`${STICKY} bg-white py-2 pl-4 pr-3 align-top shadow-[inset_3px_0_0] ${
                    sev === 'bad' ? 'shadow-red-500' : sev === 'warn' ? 'shadow-amber-400' : 'shadow-transparent'
                  }`}
                >
                  <div className="line-clamp-2 break-words leading-snug text-gray-900">{c.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {statusLabel(c)}
                    {c.budgetShared ? ' · shared budget' : ''}
                  </div>
                  {issues.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {issues.map((i) => (
                        <IssueChip key={i.kind} issue={i} />
                      ))}
                    </div>
                  )}
                  {/* The reason opens INSIDE the pinned column: a full-width
                      row below scrolled with the numbers, and on a phone the
                      sentence ran off the edge mid-word. */}
                  {isOpen && (
                    <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-gray-700">
                      {issues.map((i) => (
                        <li key={i.kind}>{i.detail}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <MetricCells
                  t={t}
                  budget={c.budgetMicros == null ? '—' : money(c.budgetMicros, a.currency)}
                  currency={a.currency}
                />
              </tr>
            </Fragment>
          )
        })}
    </>
  )
}

/** Shown while twenty-odd accounts are read — the admin home and Master
 *  Leads both stream the table in behind this, so neither waits for Google. */
export function CampaignReportSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-label="Loading campaigns">
      <div className="grid grid-cols-7 gap-1 sm:flex sm:gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-8 rounded-full bg-gray-200 sm:w-20" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-200" />
    </div>
  )
}
