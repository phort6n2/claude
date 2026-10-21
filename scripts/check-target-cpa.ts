/**
 * Target CPA vs Google: the full-spend target, the .77 rounding, the flags.
 *
 *   npx tsx scripts/check-target-cpa.ts
 *
 * The simulation points are a real account's (Oct 12–17, names removed — the
 * repo is public). Silent cases first: a campaign marked UNDERSPENDING that is
 * not is how the one that is gets scrolled past.
 */
import {
  buildRows,
  fullSpendTarget,
  inclusiveDays,
  enabledDays,
  roundUpTo77,
  simulationRows,
  recommendationTarget,
  statusFlags,
  applyRefusal,
  suggestionBelowTarget,
  isAgmpCampaign,
  type TcpaAccount,
  type TcpaCampaign,
  type TcpaSnapshot,
} from '../src/lib/target-cpa'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const near = (a: number | null | undefined, b: number, tol = 0.01) => a != null && Math.abs(a - b) <= tol
const M = 1_000_000

const TODAY = '2026-10-21'

/* Real points, Oct 12–17 (six days inclusive). */
const LEAD_GEN_SIM = {
  startDate: '2026-10-12',
  endDate: '2026-10-17',
  points: [
    { targetMicros: 22_220_000, costMicros: 290_240_000, conversions: 11.87, requiredBudgetMicros: 129_710_000 },
    { targetMicros: 27_770_000, costMicros: 570_220_000, conversions: 18.44, requiredBudgetMicros: 186_460_000 },
    { targetMicros: 36_620_000, costMicros: 900_710_000, conversions: 23.42, requiredBudgetMicros: 258_910_000 },
    { targetMicros: 47_030_000, costMicros: 1_288_560_000, conversions: 27.51, requiredBudgetMicros: 340_830_000 },
    { targetMicros: 58_270_000, costMicros: 1_717_770_000, conversions: 30.79, requiredBudgetMicros: 456_110_000 },
  ],
}
const SECOND_SIM = {
  startDate: '2026-10-12',
  endDate: '2026-10-17',
  points: [
    // Out of order on purpose: the reader sorts.
    { targetMicros: 25_770_000, costMicros: 295_700_000, conversions: 12.69, requiredBudgetMicros: 112_740_000 },
    { targetMicros: 20_870_000, costMicros: 147_750_000, conversions: 8.25, requiredBudgetMicros: 59_740_000 },
    { targetMicros: 53_860_000, costMicros: 887_950_000, conversions: 20.74, requiredBudgetMicros: 267_800_000 },
  ],
}

function days(perDay: number, from: string, to: string, conv = 1): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {}
  for (let d = from; d <= to; d = new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)) {
    out[d] = [perDay, conv]
  }
  return out
}

function campaign(over: Partial<TcpaCampaign>): TcpaCampaign {
  return {
    id: over.id || '1',
    name: 'AGMP Lead Gen',
    channel: 'SEARCH',
    biddingType: 'MAXIMIZE_CONVERSIONS',
    ownTargetMicros: 29_770_000,
    portfolio: null,
    primaryStatus: 'ELIGIBLE',
    reasons: [],
    startDate: '2025-11-15',
    budgetMicros: 100 * M,
    budgetShared: false,
    budgetResource: `customers/1/campaignBudgets/${over.id || '1'}`,
    days: days(90 * M, '2026-09-21', '2026-10-20'),
    simulation: LEAD_GEN_SIM,
    recommendations: [],
    ...over,
  }
}

function snapshot(campaigns: TcpaCampaign[], over: Partial<TcpaAccount> = {}): TcpaSnapshot {
  return {
    builtAt: '2026-10-21T10:20:00Z',
    error: null,
    accounts: [
      {
        customerId: '1',
        name: 'Shop A',
        clientId: null,
        currency: 'USD',
        timeZone: 'America/Los_Angeles',
        today: TODAY,
        campaigns,
        otherSharedSpend: {},
        error: null,
        ...over,
      },
    ],
  }
}

console.log('\nDays')
check(inclusiveDays('2026-10-12', '2026-10-17') === 6, 'Oct 12–17 is SIX days (inclusive), not five')
check(enabledDays('2026-10-18', { start: '2026-10-14', end: '2026-10-20' }) === 3, 'a campaign started on the 18th has 3 days in the week')
check(enabledDays('2025-01-01', { start: '2026-10-14', end: '2026-10-20' }) === 7, 'an old campaign has all 7')
check(enabledDays(null, { start: '2026-10-14', end: '2026-10-20' }) === 7, 'no start date counts the whole window')

console.log('\nThe .77 rounding')
check(roundUpTo77(27_765_600) === 27_770_000, '27.7656 → 27.77')
check(roundUpTo77(27_770_000) === 27_770_000, '27.77 stays 27.77')
check(roundUpTo77(27_770_004) === 27_770_000, '27.770004 (float noise) stays 27.77')
check(roundUpTo77(27_780_000) === 28_770_000, '27.78 → 28.77, never below what is needed')
check(roundUpTo77(25_415_700) === 25_770_000, '25.4157 → 25.77')
check(roundUpTo77(30_000_000) === 30_770_000, '30.00 → 30.77')

console.log('\nSimulation')
const rows = simulationRows(LEAD_GEN_SIM)
check(near(rows[1].dailySpendMicros / M, 95.04), 'the 27.77 point is ~$95/day (570.22 over six days)')
check(simulationRows(SECOND_SIM).map((r) => r.targetMicros).join() === '20870000,25770000,53860000', 'points are sorted by target')
check(simulationRows(null).length === 0, 'no simulation, no rows')

const t = fullSpendTarget(rows, 0.95 * 100 * M)
check(t.kind === 'target' && near(t.micros / M, 27.7656, 0.001), '$100 budget: full spend at ~$27.77 (interpolated between 22.22 and 27.77)')
check(fullSpendTarget(rows, 40 * M).kind === 'already', 'even the lowest point spends a $40 budget: "already spends budget"')
const above = fullSpendTarget(rows, 400 * M)
check(above.kind === 'above' && above.highestMicros === 58_270_000, 'a $400 budget is above Google\'s highest point ($58.27)')
check(fullSpendTarget([], 95 * M).kind === 'none', 'no points: "no simulation"')

console.log('\nRows — silent cases first')
{
  // Spending 90 of 100: fine.
  const [r] = buildRows(snapshot([campaign({})]))
  check(!r.underspending, '90% of budget is not underspending')
  check(near(r.spendPct, 0.9), 'spend_pct is 90%')
  check(r.suggestedMicros === 27_770_000, 'suggested .77 target is 27.77')
  check(r.targetMicros === 29_770_000, 'my target is 29.77')
}
{
  // New campaign: 3 days in, spending 20% — too new to judge.
  const [r] = buildRows(snapshot([campaign({ startDate: '2026-10-18', days: days(20 * M, '2026-10-18', '2026-10-20') })]))
  check(!r.underspending, 'a three-day-old campaign is not flagged however little it spends')
  check(r.enabledDays === 3 && near(r.spendPct, 0.2), '…and its average is over its 3 days, not 7')
}
{
  const [r] = buildRows(
    snapshot([campaign({ biddingType: 'TARGET_SPEND', ownTargetMicros: null, days: days(10 * M, '2026-09-21', '2026-10-20') })])
  )
  check(!r.underspending, 'Max Clicks is never flagged')
  check(r.suggestedMicros == null && r.targetMicros == null, 'Max Clicks gets no target and no suggestion')
  check(r.note === 'Max Clicks has no target CPA.', 'and says why')
}
{
  // Days with no spend have no row — and still count as enabled days.
  const sparse = { '2026-10-14': [140 * M, 3] as [number, number] }
  const [r] = buildRows(snapshot([campaign({ days: sparse })]))
  check(near(r.spendPct, 0.2), 'one $140 day in a week of silence is 20% — empty days are zeros, not skipped')
  check(r.underspending, '…and that IS underspending')
}

console.log('\nRows — flagged')
{
  const [r] = buildRows(snapshot([campaign({ days: days(40 * M, '2026-09-21', '2026-10-20') })]))
  check(r.underspending, '40% of budget on Max Conversions, a year old: UNDERSPENDING')
  check(near(r.cpa30Micros, 40 * M), '30-day CPA is cost ÷ conversions')
}

console.log('\nShared budget')
{
  const shared = 'customers/1/campaignBudgets/9'
  const a = campaign({ id: '1', budgetShared: true, budgetResource: shared, days: days(30 * M, '2026-09-21', '2026-10-20') })
  const b = campaign({ id: '2', name: 'AGMP PMAX', budgetShared: true, budgetResource: shared, days: days(20 * M, '2026-09-21', '2026-10-20') })
  const out = buildRows(snapshot([a, b], {
    otherSharedSpend: {
      [shared]: Object.fromEntries(Object.entries(days(10 * M, '2026-09-21', '2026-10-20')).map(([d, v]) => [d, v[0]])),
    },
  }))
  check(out.every((r) => near(r.spendPct, 0.6)), 'both campaigns read the budget\'s combined spend (30+20+10 of 100 = 60%)')
  const ra = out.find((r) => r.campaignId === '1')!
  check(near(ra.thresholdMicros, 65 * M), 'the simulation only has to fill what the others leave (95 − 30 = 65/day)')
}

console.log('\nPortfolio strategy')
{
  const [r] = buildRows(
    snapshot([
      campaign({
        ownTargetMicros: null,
        portfolio: { resourceName: 'customers/1/biddingStrategies/5', name: 'tcpa - windshield', type: 'MAXIMIZE_CONVERSIONS', targetMicros: 150 * M, campaignCount: 5 },
      }),
    ])
  )
  check(r.targetMicros === 150 * M, 'the target shown is the portfolio\'s when the campaign has none of its own')
}

console.log('\nRecommendations')
check(
  near(recommendationTarget({ type: 'RAISE_TARGET_CPA_BID_TOO_LOW', detail: { recommendedTargetMultiplier: 1.3, averageTargetCpaMicros: '20000000' } }), 26 * M, 1),
  'bid-too-low: multiplier × average (int64 as a string)'
)
check(
  near(recommendationTarget({ type: 'RAISE_TARGET_CPA', detail: { targetAdjustment: { recommendedTargetMultiplier: 1.2, currentAverageTargetMicros: '25000000' } } }), 30 * M, 1),
  'raise_target_cpa: reads inside target_adjustment'
)
check(
  recommendationTarget({ type: 'TARGET_CPA_OPT_IN', detail: { recommendedTargetCpaMicros: '31770000' } }) === 31_770_000,
  'opt-in: recommended_target_cpa_micros'
)
check(recommendationTarget({ type: 'SET_TARGET_CPA', detail: {} }) == null, 'an empty sub-message is no suggestion, not $0')

console.log('\nFlags')
check(statusFlags({ primaryStatus: 'ELIGIBLE', reasons: [] }).length === 0, 'eligible, no reasons: no flags')
check(statusFlags({ primaryStatus: 'LIMITED', reasons: ['BIDDING_STRATEGY_CONSTRAINED'] }).join() === 'bid-limited', 'CONSTRAINED is limited by bid strategy')
check(statusFlags({ primaryStatus: 'LIMITED', reasons: ['BUDGET_CONSTRAINED'] }).join() === 'budget-limited', 'BUDGET_CONSTRAINED is limited by budget')
check(statusFlags({ primaryStatus: 'LEARNING', reasons: ['BIDDING_STRATEGY_LEARNING'] }).join() === 'learning', 'learning, once')

console.log('\nSort')
{
  const out = buildRows(
    snapshot([
      campaign({ id: 'fine', name: 'AGMP A', days: days(85 * M, '2026-09-21', '2026-10-20') }),
      campaign({ id: 'low', name: 'AGMP B', days: days(50 * M, '2026-09-21', '2026-10-20') }),
      campaign({ id: 'lower', name: 'AGMP C', days: days(10 * M, '2026-09-21', '2026-10-20') }),
      campaign({ id: 'clicks', name: 'AGMP D', biddingType: 'TARGET_SPEND', days: days(5 * M, '2026-09-21', '2026-10-20') }),
    ])
  )
  check(out.map((r) => r.campaignId).join() === 'lower,low,clicks,fine', 'underspending first (lowest first), then the rest by spend share')
}

console.log('\nApply guard — refusals first')
const base = { campaignName: 'AGMP X', bidding: 'MAX_CONV' as const, suggestedMicros: 29_770_000, targetMicros: 27_770_000, portfolio: null, underspending: true }
check(!isAgmpCampaign('Search - Windshield') && isAgmpCampaign('AGMP Lead Gen'), 'only names starting AGMP')
check(applyRefusal({ ...base, campaignName: 'Search - Windshield' }) != null, 'refuses a non-AGMP campaign')
check(applyRefusal({ ...base, bidding: 'MAX_CLICKS', targetMicros: null }) != null, 'refuses Max Clicks')
check(applyRefusal({ ...base, suggestedMicros: null }) != null, 'refuses with no suggestion')
check(applyRefusal({ ...base, suggestedMicros: 27_770_000 }) != null, 'refuses a no-op')
// Live, Oct 2026: spending 100% at 38.77 and the simulation asked for 61.77.
check(applyRefusal({ ...base, underspending: false, targetMicros: 38_770_000, suggestedMicros: 61_770_000 }) != null, 'refuses to raise a campaign that already spends its budget')
// Live, Oct 2026: 73% of budget at 29.77, simulation says 27.77 spends it.
check(applyRefusal({ ...base, targetMicros: 29_770_000, suggestedMicros: 27_770_000 }) != null, 'refuses to LOWER an underspender — the target is not the limit')
check(suggestionBelowTarget({ targetMicros: 29_770_000, suggestedMicros: 27_770_000 }), '…and says so')
check(
  applyRefusal({ ...base, portfolio: { resourceName: 'x', name: 'p', type: 'TARGET_SPEND', targetMicros: null, campaignCount: 2 } }) != null,
  'refuses a shared strategy that is not Maximize Conversions'
)
check(applyRefusal(base) == null, 'allows raising an underspender to its suggestion')

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
