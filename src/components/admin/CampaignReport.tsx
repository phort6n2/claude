'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  RANGES,
  ZERO,
  DEFAULT_RANGE,
  DEFAULT_SORT,
  isSortState,
  isViewId,
  firstDir,
  campaignTotals,
  underspendingBudgets,
  underspendIssue,
  VIEWS,
  nextSort,
  sortRows,
  sortValue,
  addTotals,
  accountBudgetMicros,
  campaignIssues,
  convRate,
  costPerConv,
  isIdle,
  isRangeId,
  previousWindow,
  rangeWindow,
  statusLabel,
  visibleCampaigns,
  worstSeverity,
  type CampaignReportData,
  type RangeId,
  type SortKey,
  type SortState,
  type ViewId,
  type RankInput,
  type ReportAccount,
  type Totals,
  type TargetHint,
} from '@/lib/campaign-report'
import { errorFrom } from '@/lib/http-error'
import {
  money,
  int,
  conv,
  pct,
  shortDate,
  byCurrency,
  perConvByCurrency,
  currencyParts,
  perConvParts,
  Scorecard,
  IssueChip,
  TargetLine,
  type AccountView,
  type Row,
} from './campaign-report-ui'
import CampaignCards from './CampaignCards'
import MetricRanking from './MetricRanking'

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
const VIEW_STORAGE_KEY = 'admin-campaign-view'

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

export default function CampaignReport({
  initial,
  initialRange,
  stickyTop = 'top-0',
}: {
  initial: CampaignReportData
  initialRange: RangeId | null
  /** Where the sticky control bar sits: under the Master Leads app's own
   *  sticky header there, at the top of the admin's scrolling column here. */
  stickyTop?: string
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
  const [viewId, setViewId] = useState<ViewId>('overview')
  /** Phone cards opened by hand. Kept across range changes on purpose. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  // The last sort and view this browser chose, and an isolated account from
  // the URL (so the phone's back button and a shared link both keep it).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || 'null')
      if (isSortState(saved)) setSort(saved)
      const v = localStorage.getItem(VIEW_STORAGE_KEY)
      if (isViewId(v)) setViewId(v)
    } catch {
      /* the defaults are fine */
    }
    try {
      const account = new URL(window.location.href).searchParams.get('account')
      if (account) setFocus(account)
    } catch {
      /* ignore */
    }
  }, [])

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

  function chooseView(v: ViewId) {
    setViewId(v)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {
      /* ignore */
    }
  }

  function setSortState(next: SortState) {
    setSort(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function sortBy(key: SortKey) {
    setSortState(nextSort(sort, key))
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

  function toggleCard(customerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  /** From a quick screen: that shop, in the overview, opened. */
  function openShop(customerId: string) {
    isolate(customerId)
    chooseView('overview')
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
    const all: AccountView[] = data.accounts.map((a) => {
      const w = rangeWindow(range, a.today)
      const pw = previousWindow(w)
      // Under-spending is only judged over whole days, three or more of them:
      // today is still running and one day is one quiet day.
      const under = range !== 'today' && w.days >= 3 ? underspendingBudgets(a, w) : []
      const underFor = new Map(under.flatMap((u) => u.campaignIds.map((id) => [id, u] as const)))
      let rows: Row[] = visibleCampaigns(a, w).map(({ c, t }) => {
        const issues = campaignIssues(c, t, range, a.currency)
        const u = underFor.get(c.id)
        // A campaign already marked as not serving or unseen needs no second
        // mark saying the same thing in money.
        if (u && !issues.some((i) => i.kind === 'not-serving' || i.kind === 'no-impressions')) {
          issues.push(underspendIssue(u, a.currency))
        }
        return { c, t, issues }
      })
      const total = rows.reduce((s, r) => addTotals(s, r.t), ZERO)
      const prior = a.campaigns.reduce((s, c) => addTotals(s, campaignTotals(c, pw)), ZERO)
      const budget = accountBudgetMicros(a)
      // Campaigns follow the same choice; by name they keep their own order
      // (running first, biggest spend first), which is the useful default.
      if (sort.key === 'issues') {
        rows = sortRows(rows, sort, (r) => ({ name: r.c.name, value: r.issues.length }))
      } else if (sort.key !== 'name') {
        rows = sortRows(rows, sort, (r) => ({ name: r.c.name, value: sortValue(sort.key, r.t, r.c.budgetMicros) }))
      }
      const suspended = a.status === 'SUSPENDED'
      const flagged = rows.filter((r) => r.issues.length > 0).length + (suspended ? 1 : 0)
      return { a, rows, total, prior, budget, flagged, idle: isIdle(a), suspended }
    })

    // An isolated account is the WHOLE view: the scorecards, the count of
    // problems and every list all describe that one shop.
    const scope = focus ? all.filter((x) => x.a.customerId === focus) : all

    let now = ZERO
    let before = ZERO
    const cost: Array<{ currency: string; micros: number; conv: number }> = []
    const budgets: Array<{ currency: string; micros: number }> = []
    let issueCount = 0
    for (const x of scope) {
      issueCount += x.flagged
      if (x.a.error) continue
      now = addTotals(now, x.total)
      before = addTotals(before, x.prior)
      cost.push({ currency: x.a.currency, micros: x.total.costMicros, conv: x.total.conversions })
      if (x.budget != null) budgets.push({ currency: x.a.currency, micros: x.budget })
    }

    /* By name, the quiet accounts stay at the foot below the ones spending
       money; by a figure, the figure decides, blanks last. */
    const byName = (list: AccountView[]) => sortRows(list, sort, (x) => ({ name: x.a.name, value: null }))
    const accounts =
      sort.key === 'name'
        ? [...byName(scope.filter((x) => !x.idle)), ...byName(scope.filter((x) => x.idle))]
        : sort.key === 'issues'
          ? sortRows(scope, sort, (x) => ({ name: x.a.name, value: x.flagged }))
          : sortRows(scope, sort, (x) => ({ name: x.a.name, value: sortValue(sort.key, x.total, x.budget) }))

    const live = data.accounts.find((a) => !a.error)
    const sample = live ? rangeWindow(range, live.today) : null
    const singleCurrency = new Set(cost.map((c) => c.currency)).size <= 1
    const focused = focus ? (all.find((x) => x.a.customerId === focus)?.a ?? null) : null
    const rankInputs: RankInput[] = scope
      .filter((x) => !x.a.error && !x.idle && !x.suspended)
      .map((x) => ({ id: x.a.customerId, name: x.a.name, currency: x.a.currency, total: x.total, prior: x.prior }))
    return { accounts, now, before, cost, budgets, issueCount, sample, singleCurrency, focused, rankInputs }
  }, [data, range, sort, focus])

  const shown = onlyIssues ? view.accounts.filter((x) => x.flagged > 0 || x.a.error) : view.accounts
  const costParts = currencyParts(view.cost)
  const budgetParts = currencyParts(view.budgets)
  const cpaParts = perConvParts(view.cost)

  return (
    <section>
      {/* THE CONTROLS STAY PUT: range, view and an isolated shop are what the
          rest of the screen is ABOUT, so they never scroll away from it.
          Kept under a quarter of a phone's height together with the app
          header — a sticky area bigger than that leaves no room to read. */}
      <div className={`sticky ${stickyTop} z-30 -mx-1 space-y-2 rounded-b-xl bg-white/95 px-1 pb-2 pt-2 shadow-sm backdrop-blur`}>
        {/* All seven ranges in ONE row at every width: a sideways scroller hid
            14, 21 and 30 days off a 390px screen with nothing saying so. */}
        <div className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap sm:gap-2" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r.id)}
              aria-pressed={range === r.id}
              aria-label={r.label}
              className={`h-10 rounded-full border px-0.5 text-[11px] font-medium transition-colors min-[360px]:text-xs sm:h-9 sm:px-3.5 sm:text-sm ${
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

        <ViewSwitcher value={viewId} onChange={chooseView} />

        {focus && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-2.5 py-1">
            <span className="min-w-0 truncate text-sm text-blue-900">
              Only <span className="font-semibold">{view.focused?.name ?? 'an account no longer listed'}</span>
            </span>
            <button
              type="button"
              onClick={() => isolate(null)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Show all
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 sm:text-xs">
        <span>
          {view.sample &&
            (view.sample.start === view.sample.end
              ? shortDate(view.sample.start)
              : `${shortDate(view.sample.start)} – ${shortDate(view.sample.end)}`)}
          {view.sample && compare && (
            <> · vs the {view.sample.days === 1 ? 'day' : `${view.sample.days} days`} before</>
          )}
          {range === 'today' && ' · today’s figures run a few hours behind'}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
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
          {/* Phone: the four figures that spot a problem, then one line. */}
          <div className="mt-3 sm:hidden">
            <div className="grid grid-cols-2 gap-2">
              <Scorecard label="Cost" value={costParts[0] ?? '—'} sub={costParts.slice(1).join(' · ') || undefined}
                now={view.singleCurrency ? view.now.costMicros : undefined} before={view.singleCurrency ? view.before.costMicros : undefined} compare={compare} />
              <Scorecard label="Conversions" value={conv(view.now.conversions)} now={view.now.conversions} before={view.before.conversions} compare={compare} />
              <Scorecard label="Cost / conv." value={cpaParts[0] ?? '—'} sub={cpaParts.slice(1).join(' · ') || undefined}
                now={view.singleCurrency ? (costPerConv(view.now) ?? undefined) : undefined}
                before={view.singleCurrency ? (costPerConv(view.before) ?? undefined) : undefined} compare={compare} />
              <Scorecard label="Clicks" value={int(view.now.clicks)} now={view.now.clicks} before={view.before.clicks} compare={compare} />
            </div>
            <p className="mt-2 text-xs text-gray-600">
              {int(view.now.impressions)} impr. · {pct(convRate(view.now))} conv. rate · {int(view.now.calls)} calls · budget{' '}
              {budgetParts.join(' + ') || '—'}/day
            </p>
          </div>

          {/* Wider: every figure as a card. */}
          <div className="mt-3 hidden grid-cols-4 gap-2 sm:grid lg:grid-cols-8">
            <Scorecard label="Daily budget" value={byCurrency(view.budgets)} compare={false} />
            <Scorecard label="Cost" value={byCurrency(view.cost)}
              now={view.singleCurrency ? view.now.costMicros : undefined} before={view.singleCurrency ? view.before.costMicros : undefined} compare={compare} />
            <Scorecard label="Impressions" value={int(view.now.impressions)} now={view.now.impressions} before={view.before.impressions} compare={compare} />
            <Scorecard label="Clicks" value={int(view.now.clicks)} now={view.now.clicks} before={view.before.clicks} compare={compare} />
            <Scorecard label="Conversions" value={conv(view.now.conversions)} now={view.now.conversions} before={view.before.conversions} compare={compare} />
            <Scorecard label="Cost / conv." value={perConvByCurrency(view.cost)}
              now={view.singleCurrency ? (costPerConv(view.now) ?? undefined) : undefined}
              before={view.singleCurrency ? (costPerConv(view.before) ?? undefined) : undefined} compare={compare} />
            <Scorecard label="Conv. rate" value={pct(convRate(view.now))} now={convRate(view.now) ?? undefined} before={convRate(view.before) ?? undefined} compare={compare} />
            <Scorecard label="Calls" value={int(view.now.calls)} now={view.now.calls} before={view.before.calls} compare={compare} />
          </div>

          {/* THE PROBLEMS ARE A BUTTON, not a sentence and a 16px checkbox:
              the one thing this screen is opened to find, one tap away. */}
          {view.issueCount === 0 ? (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">Nothing needs a look in this period.</p>
          ) : (
            <button
              type="button"
              onClick={() => setOnlyIssues((v) => !v)}
              aria-pressed={onlyIssues}
              className={`mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium ${
                onlyIssues ? 'bg-red-600 text-white' : 'bg-red-50 text-red-800 ring-1 ring-red-200'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {view.issueCount} {view.issueCount === 1 ? 'thing needs' : 'things need'} a look
              </span>
              <span className="shrink-0 text-xs font-semibold underline-offset-2">{onlyIssues ? 'Show all' : 'Show only these'}</span>
            </button>
          )}

          {viewId === 'overview' ? (
            <>
              {/* Phone: cards, and the sort as a control rather than headings. */}
              <div className="mt-3 sm:hidden">
                <div className="mb-2 flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-600">
                    <span className="shrink-0">Sort</span>
                    <select
                      value={sort.key}
                      onChange={(e) => setSortState({ key: e.target.value as SortKey, dir: firstDir(e.target.value as SortKey) })}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSortState({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                    aria-label={`Reverse order (now ${sort.dir === 'asc' ? 'lowest' : 'highest'} first)`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-700"
                  >
                    <ArrowUpDown className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <CampaignCards
                  accounts={shown}
                  onlyIssues={onlyIssues}
                  expanded={expanded}
                  onToggle={toggleCard}
                  focus={focus}
                  onIsolate={isolate}
                  compare={compare}
                  targets={data.targets}
                />
              </div>

              {/* Wider: the table, sortable by its headings. */}
              <div className="mt-2 hidden max-h-[75vh] overflow-auto overscroll-contain rounded-xl border border-gray-200 bg-white sm:block">
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
                        targets={data.targets}
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
            </>
          ) : (
            <div className="mt-3">
              <MetricRanking metric={viewId} inputs={view.rankInputs} compare={compare} onPick={openShop} />
            </div>
          )}

          <details className="mt-3 text-xs leading-relaxed text-gray-600">
            <summary className="cursor-pointer py-2 font-medium text-gray-700">About these numbers</summary>
            <p>
              Every figure is Google’s own, in each account’s time zone, and ranges end yesterday as they do in Google Ads.
              Budget is per day. Cost / conv. is Google’s cost ÷ conversions. Conv. rate is conversions ÷ interactions.
              Calls are calls from the call button on the ads, as Google counts them — not every call to a shop’s tracking
              number. “Spending N% of budget” means under half the daily budget on average over the period (3 days or
              more); you also get a push and an email the morning a campaign starts doing it. Amounts in two currencies are
              never added together, and sort as plain numbers.
            </p>
          </details>
        </>
      )}
    </section>
  )
}

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'issues', label: 'Needs a look' },
  { key: 'cost', label: 'Cost' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'costPerConv', label: 'Cost / conv.' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'budget', label: 'Budget' },
  { key: 'calls', label: 'Calls' },
]

/** Overview or one figure. A radio group, because exactly one is on. */
function ViewSwitcher({ value, onChange }: { value: ViewId; onChange: (v: ViewId) => void }) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = VIEWS.findIndex((v) => v.id === value)
    const next = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length]
    onChange(next.id)
  }
  return (
    <div
      role="radiogroup"
      aria-label="View"
      onKeyDown={onKeyDown}
      className="grid grid-cols-5 gap-1 rounded-lg bg-gray-100 p-1 sm:inline-grid"
    >
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={value === v.id}
          tabIndex={value === v.id ? 0 : -1}
          onClick={() => onChange(v.id)}
          className={`h-9 rounded-md px-1 text-xs font-medium sm:px-3 sm:text-sm ${
            value === v.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-white'
          }`}
        >
          <span className="sm:hidden">{v.short}</span>
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
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
  targets,
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
  targets?: Record<string, TargetHint>
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
                  <TargetLine c={c} hint={targets?.[key]} currency={a.currency} />
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
