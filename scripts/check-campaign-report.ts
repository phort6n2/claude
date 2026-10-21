/**
 * The admin home's campaign table: ranges, totals and the marks.
 *
 *   npx tsx scripts/check-campaign-report.ts
 *
 * Silent cases first. A mark on a campaign that is fine is how a table teaches
 * its reader to skim past the marks, so what must stay unmarked is held before
 * what must be marked.
 */
import {
  RANGES,
  rangeWindow,
  previousWindow,
  campaignTotals,
  campaignIssues,
  accountBudgetMicros,
  convRate,
  costPerConv,
  nextSort,
  sortRows,
  DEFAULT_SORT,
  underspendingBudgets,
  rankAccounts,
  ZERO,
  visibleCampaigns,
  isIdle,
  statusLabel,
  type ReportCampaign,
  type ReportAccount,
  type DayMetrics,
} from '../src/lib/campaign-report'
import { findUnderspending, newSince } from '../src/lib/budget-pacing'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const TODAY = '2026-10-20'
const days = (from: string, to: string, m: DayMetrics): Record<string, DayMetrics> => {
  const out: Record<string, DayMetrics> = {}
  for (let d = from; d <= to; ) {
    out[d] = m
    const [y, mo, da] = d.split('-').map(Number)
    d = new Date(Date.UTC(y, mo - 1, da + 1)).toISOString().slice(0, 10)
  }
  return out
}
const campaign = (over: Partial<ReportCampaign>): ReportCampaign => ({
  id: '1',
  name: 'AGMP Lead Gen',
  status: 'ENABLED',
  primaryStatus: 'ELIGIBLE',
  reasons: [],
  channel: 'SEARCH',
  budgetId: 'b1',
  budgetMicros: 100_000_000,
  budgetShared: false,
  days: {},
  ...over,
})

const account0 = (): ReportAccount => ({
  customerId: '1',
  name: 'x',
  clientId: null,
  currency: 'USD',
  timeZone: 'America/Chicago',
  status: 'ENABLED',
  today: TODAY,
  error: null,
  campaigns: [],
})

console.log('\nRANGES FOLLOW GOOGLE: "last N days" ENDS YESTERDAY')
check(JSON.stringify(rangeWindow('today', TODAY)) === JSON.stringify({ start: TODAY, end: TODAY, days: 1 }), 'today is today only')
check(rangeWindow('yesterday', TODAY).start === '2026-10-19' && rangeWindow('yesterday', TODAY).end === '2026-10-19', 'yesterday is the 19th')
const w7 = rangeWindow('7d', TODAY)
check(w7.start === '2026-10-13' && w7.end === '2026-10-19' && w7.days === 7, '7 days = 13–19 Oct, today excluded')
check(rangeWindow('30d', '2026-03-01').start === '2026-01-30', '30 days across a February')
check(JSON.stringify(previousWindow(w7)) === JSON.stringify({ start: '2026-10-06', end: '2026-10-12', days: 7 }), 'the comparison is the 7 days before')
check(RANGES.map((r) => r.id).join(',') === 'today,yesterday,3d,7d,14d,21d,30d', 'every range asked for, in order')
check(previousWindow(rangeWindow('30d', TODAY)).start >= '2026-08-21', 'the longest comparison fits inside HISTORY_DAYS (60)')

console.log('\nNO MARK ON A HEALTHY, LEARNING, PAUSED OR QUIET-MORNING CAMPAIGN')
// AGS's real shape: LEARNING with BIDDING_STRATEGY_LEARNING, spending and converting.
const ags = campaign({
  primaryStatus: 'LEARNING',
  reasons: ['BIDDING_STRATEGY_LEARNING'],
  days: days('2026-10-13', '2026-10-19', [72_260_000, 130, 5, 5, 0.998958, 1]),
})
check(campaignIssues(ags, campaignTotals(ags, w7), '7d').length === 0, 'learning and converting: unmarked')
check(statusLabel(ags) === 'Learning', '…and its status reads Learning')
const paused = campaign({ status: 'PAUSED', primaryStatus: 'PAUSED' })
check(campaignIssues(paused, campaignTotals(paused, w7), '7d').length === 0, 'paused with nothing: a decision, not a fault')
const quiet = campaign({ days: {} })
check(campaignIssues(quiet, campaignTotals(quiet, rangeWindow('today', TODAY)), 'today').length === 0, 'no impressions yet TODAY: an ordinary morning')
// $60 spent, no conversions, on a $100/day budget: under two days of budget.
const slow = campaign({ days: { '2026-10-19': [60_000_000, 40, 3, 3, 0, 0] } })
check(campaignIssues(slow, campaignTotals(slow, w7), '7d').length === 0, 'a slow day under 2x the daily budget: unmarked')
// $40, no conversions, $10/day budget: past 2 days of budget but under the floor.
const tiny = campaign({ budgetMicros: 10_000_000, days: { '2026-10-19': [40_000_000, 40, 3, 3, 0, 0] } })
check(campaignIssues(tiny, campaignTotals(tiny, w7), '7d').length === 0, 'under the $50 floor: unmarked')
// Found on AGS's live account: ENABLED, end date passed, primary_status ENDED.
const ended = campaign({ primaryStatus: 'ENDED', days: {} })
check(campaignIssues(ended, campaignTotals(ended, w7), '7d').length === 0, 'enabled but ENDED: not "No impressions"')
check(statusLabel(ended) === 'Ended', '…its status says Ended')
check(visibleCampaigns({ ...account0(), campaigns: [ended] }, w7).length === 0, '…and an ended campaign that spent nothing is not a row')
// Found on a live account: Google's system-generated Local Services campaign.
const lsa = campaign({ name: 'LocalServicesCampaign:SystemGenerated:0006', channel: 'LOCAL_SERVICES', days: {} })
check(campaignIssues(lsa, campaignTotals(lsa, w7), '7d').length === 0, 'Local Services with no impression rows: unmarked')
// Found on ElitePro's live account: the API sent UNKNOWN beside a real reason.
const withUnknown = campaign({ primaryStatus: 'LIMITED', reasons: ['BUDGET_CONSTRAINED', 'UNKNOWN'], days: ags.days })
check(campaignIssues(withUnknown, campaignTotals(withUnknown, w7), '7d')[0]?.label === 'Limited by budget', '"UNKNOWN" is not shown as a reason')
const limitedLearning = campaign({ primaryStatus: 'LIMITED', reasons: ['BIDDING_STRATEGY_LEARNING'], days: ags.days })
check(campaignIssues(limitedLearning, campaignTotals(limitedLearning, w7), '7d').length === 0, 'Limited only by learning: unmarked')

console.log('\nMARKED: GOOGLE SAYS IT CANNOT SERVE, NOBODY SAW IT, OR MONEY WITH NOTHING BACK')
const disapproved = campaign({ primaryStatus: 'NOT_ELIGIBLE', reasons: ['HAS_ADS_DISAPPROVED'] })
const d = campaignIssues(disapproved, campaignTotals(disapproved, w7), '7d')
check(d.length === 1 && d[0].kind === 'not-serving' && d[0].label === 'Ads disapproved', 'not eligible: one mark, in Google’s words, not doubled by "no impressions"')
const budgetLimited = campaign({ primaryStatus: 'LIMITED', reasons: ['BUDGET_CONSTRAINED'], days: ags.days })
const b = campaignIssues(budgetLimited, campaignTotals(budgetLimited, w7), '7d')
check(b.length === 1 && b[0].severity === 'warn' && b[0].label === 'Limited by budget', 'limited by budget: a warning')
const unseen = campaign({ days: {} })
check(campaignIssues(unseen, campaignTotals(unseen, w7), '7d').some((i) => i.kind === 'no-impressions'), 'enabled, eligible, a week of no impressions: marked')
check(campaignIssues(unseen, campaignTotals(unseen, rangeWindow('yesterday', TODAY)), 'yesterday').some((i) => i.kind === 'no-impressions'), '…and for a whole day yesterday')
const burning = campaign({ days: days('2026-10-13', '2026-10-19', [40_000_000, 90, 6, 6, 0, 0]) })
const burn = campaignIssues(burning, campaignTotals(burning, w7), '7d')
check(burn.length === 1 && burn[0].kind === 'no-conversions', '$280 over a week, no conversions: marked')
check(campaignIssues(burning, campaignTotals(burning, w7), '7d')[0].detail.includes('$280.00'), '…and it says how much')
const odd = campaign({ primaryStatus: 'NOT_ELIGIBLE', reasons: ['SOMETHING_NEW_FROM_GOOGLE'] })
check(campaignIssues(odd, campaignTotals(odd, w7), '7d')[0].label === 'Something new from google', 'an unknown reason is shown readably, not hidden')

console.log('\nTOTALS')
const pooled = campaign({ days: { '2026-10-18': [0, 10, 1, 1, 1, 0], '2026-10-19': [0, 900, 99, 99, 1, 0] } })
check(Math.abs((convRate(campaignTotals(pooled, w7)) ?? 0) - 0.02) < 1e-9, 'conv. rate is pooled (2 / 100), not a mean of daily rates (50.5%)')
check(convRate(campaignTotals(quiet, w7)) === null, 'no interactions: no rate, not 0%')
check(costPerConv(campaignTotals(quiet, w7)) === null, 'no conversions: no cost per conversion, not $0')
check(costPerConv({ costMicros: 300_000_000, impressions: 0, clicks: 0, interactions: 0, conversions: 2.5, calls: 0 }) === 120_000_000, 'cost per conversion is cost ÷ conversions, fractional conversions included ($300 / 2.5 = $120)')
const account: ReportAccount = {
  customerId: '6109211627',
  name: 'AGS',
  clientId: null,
  currency: 'CAD',
  timeZone: 'America/Vancouver',
  status: 'ENABLED',
  today: TODAY,
  error: null,
  campaigns: [
    campaign({ id: '1', budgetId: 'shared', budgetMicros: 50_000_000, budgetShared: true }),
    campaign({ id: '2', budgetId: 'shared', budgetMicros: 50_000_000, budgetShared: true }),
    campaign({ id: '3', budgetId: 'own', budgetMicros: 20_000_000 }),
    campaign({ id: '4', status: 'PAUSED', budgetId: 'p', budgetMicros: 999_000_000 }),
  ],
}
check(accountBudgetMicros(account) === 70_000_000, 'a shared budget counts once; a paused campaign’s budget not at all')

console.log('\nROWS')
const rows = visibleCampaigns(
  {
    ...account,
    campaigns: [
      campaign({ id: 'p0', status: 'PAUSED', name: 'Old, paused, nothing spent' }),
      campaign({ id: 'p1', status: 'PAUSED', name: 'Paused mid-week', days: { '2026-10-14': [5_000_000, 3, 1, 1, 0, 0] } }),
      campaign({ id: 'e0', name: 'Enabled, unseen' }),
      campaign({ id: 'e1', name: 'Enabled, spending', days: { '2026-10-19': [9_000_000, 10, 1, 1, 0, 0] } }),
    ],
  },
  w7
).map((r) => r.c.id)
check(rows.join(',') === 'e1,e0,p1', 'enabled first by cost (unseen kept), paused only when it spent')
check(isIdle({ ...account, campaigns: [campaign({ status: 'PAUSED' })] }), 'nothing enabled, nothing spent: idle, one line at the foot')
check(!isIdle({ ...account, error: 'boom', campaigns: [] }), 'a failed read is never filed as idle')
check(!isIdle({ ...account, status: 'SUSPENDED', campaigns: [] }), 'a suspended account with nothing running is not filed as idle')

console.log('\nSORTING')
check(DEFAULT_SORT.key === 'name' && DEFAULT_SORT.dir === 'asc', 'alphabetical by default, as the admin home always was')
const s1 = nextSort(DEFAULT_SORT, 'cost')
check(s1.key === 'cost' && s1.dir === 'desc', 'a first tap on a figure puts the biggest first')
check(nextSort(s1, 'cost').dir === 'asc', 'a second tap on the same heading reverses it')
check(nextSort(nextSort(s1, 'cost'), 'name').dir === 'asc', 'switching to names starts at A')
const cpa = [
  { name: 'Blank', value: null },
  { name: 'Cheap', value: 10 },
  { name: 'Dear', value: 90 },
]
check(sortRows(cpa, { key: 'costPerConv', dir: 'desc' }, (x) => x).map((x) => x.name).join(',') === 'Dear,Cheap,Blank', 'highest first, a blank (nothing converted) last')
check(sortRows(cpa, { key: 'costPerConv', dir: 'asc' }, (x) => x).map((x) => x.name).join(',') === 'Cheap,Dear,Blank', 'lowest first — and the blank is STILL last, not first')
check(sortRows([{ name: 'b', value: 5 }, { name: 'A', value: 5 }], { key: 'cost', dir: 'desc' }, (x) => x).map((x) => x.name).join(',') === 'A,b', 'a tie falls back to the name, A first, ignoring case')
check(sortRows([{ name: 'b', value: null }, { name: 'A', value: null }], { key: 'name', dir: 'desc' }, (x) => x).map((x) => x.name).join(',') === 'b,A', 'names reverse on a second tap')

console.log('\nUNDER-SPENDING: SILENT CASES FIRST')
const w3 = { start: '2026-10-17', end: '2026-10-19', days: 3 }
const acct = (campaigns: ReportCampaign[]): ReportAccount => ({ ...account0(), campaigns })
// $100/day budget spending $60/day: 60% — fine.
check(underspendingBudgets(acct([campaign({ days: days('2026-10-17', '2026-10-19', [60_000_000, 50, 5, 5, 1, 0]) })]), w3).length === 0, 'spending 60% of budget: silent')
check(underspendingBudgets(acct([campaign({ budgetMicros: 5_000_000, days: {} })]), w3).length === 0, 'a $5/day budget spending nothing: silent (under the $10 floor)')
check(underspendingBudgets(acct([campaign({ status: 'PAUSED', days: {} })]), w3).length === 0, 'paused: silent')
check(underspendingBudgets(acct([campaign({ primaryStatus: 'ENDED', days: {} })]), w3).length === 0, 'ended: silent')
check(underspendingBudgets(acct([campaign({ primaryStatus: 'NOT_ELIGIBLE', reasons: ['HAS_ADS_DISAPPROVED'], days: {} })]), w3).length === 0, 'not eligible: its own mark already says why, silent here')
check(underspendingBudgets(acct([campaign({ primaryStatus: 'LIMITED', reasons: ['BUDGET_CONSTRAINED'], days: {} })]), w3).length === 0, 'limited BY budget is the opposite fault: silent')
check(underspendingBudgets(acct([campaign({ channel: 'LOCAL_SERVICES', days: {} })]), w3).length === 0, 'Local Services: silent')
check(underspendingBudgets({ ...acct([campaign({ days: {} })]), error: 'boom' }, w3).length === 0, 'an unreadable account files nothing')
// Shared $100 budget, two campaigns spending $30/day each = 60%: fine as a budget.
check(
  underspendingBudgets(acct([
    campaign({ id: 'a', budgetId: 'sh', budgetShared: true, days: days('2026-10-17', '2026-10-19', [30_000_000, 9, 1, 1, 0, 0]) }),
    campaign({ id: 'b', budgetId: 'sh', budgetShared: true, days: days('2026-10-17', '2026-10-19', [30_000_000, 9, 1, 1, 0, 0]) }),
  ]), w3).length === 0,
  'a shared budget is judged as ONE budget (30% + 30% = 60%), not two under-spenders'
)

console.log('\nUNDER-SPENDING: MARKED')
const low = underspendingBudgets(acct([campaign({ days: days('2026-10-17', '2026-10-19', [20_000_000, 9, 1, 1, 0, 0]) })]), w3)
check(low.length === 1 && Math.abs(low[0].share - 0.2) < 1e-9, '$20/day of $100/day: marked at 20%')
const none = underspendingBudgets(acct([campaign({ days: {} })]), w3)
check(none.length === 1 && none[0].spentMicros === 0, 'an eligible campaign spending nothing for three days: marked')

console.log('\nTHE ALERT TELLS YOU ONCE')
const data = { builtAt: '', error: null, accounts: [acct([campaign({ days: {} })])] }
const hits = findUnderspending(data)
check(hits.length === 1, 'the alert reads the same rule over the last three complete days')
check(newSince(hits, {}).length === 1, 'first morning: new, alert')
check(newSince(hits, { [hits[0].key]: '2026-10-19' }).length === 0, 'next morning, still under-spending: already told, silent')

console.log('\nQUICK SCREENS')
const T = (cost: number, conv: number, clicks = 10) => ({ ...ZERO, costMicros: cost * 1_000_000, conversions: conv, clicks, interactions: clicks })
const inputs = [
  { id: 'a', name: 'Alpha', currency: 'USD', total: T(500, 10), prior: T(400, 10) },
  { id: 'b', name: 'Bravo', currency: 'USD', total: T(300, 0), prior: T(300, 5) },
  { id: 'c', name: 'Charlie', currency: 'USD', total: T(0, 0, 0), prior: T(0, 0, 0) },
  { id: 'd', name: 'Delta', currency: 'CAD', total: T(100, 2), prior: T(100, 2) },
]
const byCost = rankAccounts('cost', inputs)
check(byCost.map((r) => r.id).join(',') === 'a,b,d,c', 'cost: biggest first, a shop that spent nothing last')
check(byCost.find((r) => r.id === 'd')!.bar === 1, 'a CAD bar is drawn against CAD accounts only (the only one, so full)')
check(Math.abs(byCost.find((r) => r.id === 'b')!.bar - 0.6) < 1e-9, '…and a USD bar against the biggest USD one ($300 of $500)')
const byCpa = rankAccounts('costPerConv', inputs)
check(byCpa[0].id === 'b' && byCpa[0].noConvSpend, 'cost / conv.: spent $300 and converted nothing LEADS, rather than sinking as a blank')
check(byCpa[byCpa.length - 1].id === 'c' && !byCpa[byCpa.length - 1].noConvSpend, '…and a shop that spent nothing is last, not "no conversions"')
check(Math.abs((rankAccounts('cost', inputs)[0].change ?? 0) - 0.25) < 1e-9, 'the change is against the same days before ($500 vs $400 = +25%)')

console.log(failures ? `\n${failures} FAILED` : '\nAll campaign-report checks passed')
process.exit(failures ? 1 : 0)
