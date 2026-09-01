import { adsSearch } from '@/lib/google-ads'
import {
  fileFindings,
  listAdsClients,
  type DailyRunSummary,
  type FindingDraft,
} from '@/lib/google-ads-checks'

/**
 * The optimization playbook: WEEKLY rules that reason the way a careful
 * account manager does — maturity before targets, evidence before claims,
 * and above all NOT touching what was recently touched.
 *
 * Two mechanisms make it safe on low-volume local accounts:
 *
 * COOLDOWNS. Before any rule recommends changing a thing, the change history
 * (change_event, which Google keeps for 30 days) is consulted. A campaign
 * whose bidding was touched inside BIDDING_COOLDOWN_DAYS gets NO bidding
 * recommendations — smart bidding relearns after every change, and judging
 * or re-changing mid-learning is how accounts get thrashed. Suppressions are
 * counted in the run summary, so "why is it quiet about X" is answerable.
 *
 * THE MATURITY LADDER. A campaign earns its bidding strategy: clicks to
 * learn, Maximize Conversions once conversions actually flow, a target CPA
 * only once volume can support one — and the target starts at the OBSERVED
 * CPA, never at the number somebody wishes were true.
 *
 * Thresholds live in PLAYBOOK_THRESHOLDS with the reasoning inline, and
 * docs/GOOGLE-ADS-PLAYBOOK.md carries the expert sourcing. Change a number
 * there, and the finding text quotes the new one automatically.
 */

/**
 * Thresholds, each traceable to docs/GOOGLE-ADS-PLAYBOOK.md where the
 * expert sourcing (and the disagreements) live.
 */
export const PLAYBOOK_THRESHOLDS = {
  /** Google's hard floor for tCPA is 15 conversions/30d; consensus comfort
   * is 30. An EXISTING target below 15 is flagged as clearly premature —
   * the 15–30 band is grey and stays quiet. */
  MIN_CONVERSIONS_FOR_TCPA: 15,
  /** Practitioner majority moves clicks-bidding to Maximize Conversions at
   * 15–25 accumulated conversions; 20 is the middle of that band. */
  GRADUATE_FROM_CLICKS: 20,
  /** ADDING a target wants the consensus 30/30d, not the floor. */
  CONSIDER_TCPA_AT: 30,
  /** Days to leave a campaign alone after any bidding change. Google says
   * up to 3 weeks; 7 minimum / 14 preferred is the practitioner rule. */
  BIDDING_COOLDOWN_DAYS: 14,
  /** Days before ANY same-area recommendation repeats after a change. */
  SETTING_COOLDOWN_DAYS: 30,
  /** A campaign younger than this gets no structural recommendations at
   * all — it is still learning what it is. */
  MIN_CAMPAIGN_AGE_DAYS: 21,
  /** PMax needs longer: judge nothing before six weeks. */
  PMAX_MIN_AGE_DAYS: 42,
  /** A zero-conversion search term is a negatives CANDIDATE at 2× the
   * campaign's observed CPA (consensus band is 2–3×) — statistics, not
   * annoyance, is the bar. Where the campaign has no CPA yet, the flat
   * floor stands in. Intent-based negatives (wrong service, DIY, jobs)
   * are a human call at any spend and are not automated here. */
  NEGATIVE_CANDIDATE_CPA_MULTIPLE: 2,
  NEGATIVE_CANDIDATE_MIN_SPEND: 50,
  NEGATIVE_CANDIDATE_MIN_CLICKS: 8,
} as const

type Row = Record<string, unknown>
const get = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))
const micros = (v: unknown): number => num(v) / 1_000_000

export interface CampaignState {
  id: string
  name: string
  channel: string // SEARCH | PERFORMANCE_MAX | ...
  biddingStrategyType: string
  /** From maximize_conversions.target_cpa_micros or target_cpa. */
  targetCpa: number | null
  startDate: string
  ageDays: number
  conversions30: number
  cost30: number
  dailyBudget: number | null
  searchPartners: boolean
  displayExpansion: boolean
  geoTargetType: string
  urlExpansionOptOut: boolean
}

export interface CooldownState {
  /** campaign id → days since the last bidding-ish change (null = none in 30d). */
  biddingChangedDaysAgo: Map<string, number>
  /** campaign id → days since ANY change (null = none in 30d). */
  anyChangedDaysAgo: Map<string, number>
}

export function parseCampaignRows(rows: Row[]): CampaignState[] {
  const now = Date.now()
  return rows.map((row) => {
    const startDate = str(get(row, 'campaign.startDate'))
    const ageDays = startDate
      ? Math.floor((now - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000)
      : 9999
    const maxConvTarget = num(get(row, 'campaign.maximizeConversions.targetCpaMicros'))
    const tcpaTarget = num(get(row, 'campaign.targetCpa.targetCpaMicros'))
    const target = maxConvTarget || tcpaTarget
    return {
      id: str(get(row, 'campaign.id')),
      name: str(get(row, 'campaign.name')),
      channel: str(get(row, 'campaign.advertisingChannelType')),
      biddingStrategyType: str(get(row, 'campaign.biddingStrategyType')),
      targetCpa: target ? micros(target) : null,
      startDate,
      ageDays,
      conversions30: num(get(row, 'metrics.conversions')),
      cost30: micros(get(row, 'metrics.costMicros')),
      dailyBudget: num(get(row, 'campaignBudget.amountMicros'))
        ? micros(get(row, 'campaignBudget.amountMicros'))
        : null,
      searchPartners: get(row, 'campaign.networkSettings.targetPartnerSearchNetwork') === true,
      displayExpansion: get(row, 'campaign.networkSettings.targetContentNetwork') === true,
      geoTargetType: str(get(row, 'campaign.geoTargetTypeSetting.positiveGeoTargetType')),
      urlExpansionOptOut: get(row, 'campaign.urlExpansionOptOut') === true,
    }
  })
}

/** Which changed fields count as "bidding was touched". */
const BIDDING_FIELD_HINTS = [
  'bidding',
  'target_cpa',
  'targetCpa',
  'maximize_conversions',
  'maximizeConversions',
  'target_roas',
  'targetRoas',
]

export function parseCooldowns(rows: Row[]): CooldownState {
  const now = Date.now()
  const bidding = new Map<string, number>()
  const any = new Map<string, number>()
  for (const row of rows) {
    const when = str(get(row, 'changeEvent.changeDateTime'))
    const campaignRes = str(get(row, 'changeEvent.campaign'))
    const campaignId = campaignRes.split('/').pop() || ''
    if (!campaignId || !when) continue
    const daysAgo = Math.floor((now - new Date(when.replace(' ', 'T') + 'Z').getTime()) / 86_400_000)
    const prevAny = any.get(campaignId)
    if (prevAny === undefined || daysAgo < prevAny) any.set(campaignId, daysAgo)
    const fields = str(get(row, 'changeEvent.changedFields'))
    const resourceType = str(get(row, 'changeEvent.changeResourceType'))
    const biddingTouched =
      resourceType === 'CAMPAIGN_BUDGET' ||
      BIDDING_FIELD_HINTS.some((hint) => fields.includes(hint))
    if (biddingTouched) {
      const prev = bidding.get(campaignId)
      if (prev === undefined || daysAgo < prev) bidding.set(campaignId, daysAgo)
    }
  }
  return { biddingChangedDaysAgo: bidding, anyChangedDaysAgo: any }
}

export interface PlaybookResult {
  drafts: FindingDraft[]
  /** Recommendations withheld because the setting was recently touched. */
  heldByCooldown: Array<{ campaign: string; rule: string; daysAgo: number }>
}

/**
 * The rules. Pure: campaign states + cooldowns in, drafts out, so every
 * threshold is testable against fixtures.
 */
export function evaluatePlaybook(
  campaigns: CampaignState[],
  cooldowns: CooldownState,
  searchTermRows: Row[]
): PlaybookResult {
  const T = PLAYBOOK_THRESHOLDS
  const drafts: FindingDraft[] = []
  const held: PlaybookResult['heldByCooldown'] = []

  const inBiddingCooldown = (c: CampaignState): number | null => {
    const days = cooldowns.biddingChangedDaysAgo.get(c.id)
    return days !== undefined && days < T.BIDDING_COOLDOWN_DAYS ? days : null
  }
  const inSettingCooldown = (c: CampaignState): number | null => {
    const days = cooldowns.anyChangedDaysAgo.get(c.id)
    return days !== undefined && days < T.SETTING_COOLDOWN_DAYS ? days : null
  }
  const hold = (c: CampaignState, rule: string, daysAgo: number) =>
    held.push({ campaign: c.name, rule, daysAgo })

  for (const c of campaigns) {
    const isSearch = c.channel === 'SEARCH'
    const isPmax = c.channel === 'PERFORMANCE_MAX'
    if (!isSearch && !isPmax) continue
    const observedCpa = c.conversions30 > 0 ? c.cost30 / c.conversions30 : null
    const evidenceBase = {
      window: 'last 30 days',
      conversions30: Number(c.conversions30.toFixed(1)),
      cost30: Number(c.cost30.toFixed(2)),
      observedCpa: observedCpa ? Number(observedCpa.toFixed(2)) : null,
      campaignAgeDays: c.ageDays,
      biddingStrategy: c.biddingStrategyType,
      targetCpa: c.targetCpa,
    }

    // --- Maturity ladder -------------------------------------------------
    const minAge = isPmax ? T.PMAX_MIN_AGE_DAYS : T.MIN_CAMPAIGN_AGE_DAYS
    if (c.ageDays >= minAge) {
      // Rung down: a target CPA the data cannot support.
      if (c.targetCpa !== null && c.conversions30 < T.MIN_CONVERSIONS_FOR_TCPA) {
        const cooldown = inBiddingCooldown(c)
        if (cooldown !== null) hold(c, 'tcpa-before-data', cooldown)
        else
          drafts.push({
            check: 'tcpa-before-data',
            severity: 'REVIEW',
            entity: `campaign:${c.id}`,
            title: `${c.name}: target CPA set before the data can support one`,
            detail: `Target CPA is $${c.targetCpa.toFixed(0)} on ${c.conversions30.toFixed(0)} conversions in 30 days — below the ~${T.MIN_CONVERSIONS_FOR_TCPA} the bidding needs to learn from. Consider removing the target (plain Maximize Conversions) until volume supports it${observedCpa ? `; observed CPA is $${observedCpa.toFixed(0)}` : ''}.`,
            evidence: { ...evidenceBase, threshold: T.MIN_CONVERSIONS_FOR_TCPA },
          })
      }
      // A target the budget cannot explore. Google's floor is a daily budget
      // of 2x the target CPA (practitioners say 3-5x); below 2x the bidder
      // cannot finish a day's auction exploration and volume starves.
      if (
        c.targetCpa !== null &&
        c.dailyBudget !== null &&
        c.dailyBudget < 2 * c.targetCpa &&
        c.conversions30 >= T.MIN_CONVERSIONS_FOR_TCPA
      ) {
        const cooldown = inBiddingCooldown(c)
        if (cooldown !== null) hold(c, 'budget-below-target', cooldown)
        else
          drafts.push({
            check: 'budget-below-target',
            severity: 'REVIEW',
            entity: `campaign:${c.id}`,
            title: `${c.name}: daily budget under 2× the target CPA`,
            detail: `Budget $${c.dailyBudget.toFixed(0)}/day against a $${c.targetCpa.toFixed(0)} target — Google's own floor is 2×, practitioners prefer 3–5×. Either raise the budget (≤20% steps) or raise/remove the target; at this ratio the bidder cannot explore enough auctions in a day.`,
            evidence: { ...evidenceBase, dailyBudget: c.dailyBudget, floor: 2 * c.targetCpa },
          })
      }
      // Rung up: clicks-bidding on a campaign that converts.
      if (
        isSearch &&
        c.biddingStrategyType === 'TARGET_SPEND' &&
        c.conversions30 >= T.GRADUATE_FROM_CLICKS
      ) {
        const cooldown = inBiddingCooldown(c)
        if (cooldown !== null) hold(c, 'graduate-bidding', cooldown)
        else
          drafts.push({
            check: 'graduate-bidding',
            severity: 'REVIEW',
            entity: `campaign:${c.id}`,
            title: `${c.name}: ready to graduate from Maximize Clicks`,
            detail: `${c.conversions30.toFixed(0)} conversions in 30 days on click-based bidding. That is enough signal for Maximize Conversions — clicks-bidding at this volume optimises for the wrong thing. One change, then leave it ${T.BIDDING_COOLDOWN_DAYS} days to learn.`,
            evidence: { ...evidenceBase, threshold: T.GRADUATE_FROM_CLICKS },
          })
      }
      // Rung up: mature Maximize Conversions that could take a target.
      if (
        c.biddingStrategyType === 'MAXIMIZE_CONVERSIONS' &&
        c.targetCpa === null &&
        c.conversions30 >= T.CONSIDER_TCPA_AT &&
        observedCpa !== null
      ) {
        const cooldown = inBiddingCooldown(c)
        if (cooldown !== null) hold(c, 'consider-tcpa', cooldown)
        else
          drafts.push({
            check: 'consider-tcpa',
            severity: 'REVIEW',
            entity: `campaign:${c.id}`,
            title: `${c.name}: volume now supports a target CPA`,
            detail: `${c.conversions30.toFixed(0)} conversions in 30 days at an observed $${observedCpa.toFixed(0)} CPA. Set the target at or 10–20% ABOVE the observed number — never below it, and never at the wished-for price — then walk it down 10–15% at a time, ${T.BIDDING_COOLDOWN_DAYS}+ days apart, stopping when volume sags.`,
            evidence: { ...evidenceBase, threshold: T.CONSIDER_TCPA_AT },
          })
      }
    }

    // --- Settings that quietly leak (Search) -----------------------------
    if (isSearch && c.searchPartners) {
      const cooldown = inSettingCooldown(c)
      if (cooldown !== null) hold(c, 'search-partners-on', cooldown)
      else
        drafts.push({
          check: 'search-partners-on',
          severity: 'REVIEW',
          entity: `campaign:${c.id}`,
          title: `${c.name}: search partners are on`,
          detail:
            'Search-partner placements convert worse than Google Search for local lead gen and cannot be bid separately. Worth turning off unless the numbers say otherwise for this account.',
          evidence: evidenceBase,
        })
    }
    if (isSearch && c.displayExpansion) {
      const cooldown = inSettingCooldown(c)
      if (cooldown !== null) hold(c, 'display-expansion-on', cooldown)
      else
        drafts.push({
          check: 'display-expansion-on',
          severity: 'REVIEW',
          entity: `campaign:${c.id}`,
          title: `${c.name}: Display expansion is on for a Search campaign`,
          detail:
            'Display expansion spends Search budget on Display placements, which for emergency-intent local services is almost always waste. Turn it off and let Search budget buy searches.',
          evidence: evidenceBase,
        })
    }
    if (c.geoTargetType === 'PRESENCE_OR_INTEREST') {
      const cooldown = inSettingCooldown(c)
      if (cooldown !== null) hold(c, 'geo-interest', cooldown)
      else
        drafts.push({
          check: 'geo-interest',
          severity: 'REVIEW',
          entity: `campaign:${c.id}`,
          title: `${c.name}: location targeting includes "interest"`,
          detail:
            'Presence-or-interest shows ads to people merely interested in the area — someone researching a trip, not someone with a cracked windshield in town. Switch to Presence so the budget buys people who are actually here.',
          evidence: { ...evidenceBase, geoTargetType: c.geoTargetType },
        })
    }

    // --- PMax-specific ---------------------------------------------------
    if (isPmax && !c.urlExpansionOptOut && c.ageDays >= T.PMAX_MIN_AGE_DAYS) {
      const cooldown = inSettingCooldown(c)
      if (cooldown !== null) hold(c, 'pmax-url-expansion', cooldown)
      else
        drafts.push({
          check: 'pmax-url-expansion',
          severity: 'REVIEW',
          entity: `campaign:${c.id}`,
          title: `${c.name}: PMax final URL expansion is on`,
          detail:
            'URL expansion lets Google send clicks to any page it finds and rewrite the ad to match — for a lead-gen site with one job, that dilutes traffic away from the pages built to convert it. Most lead-gen practitioners opt out and send everything to the landing pages.',
          evidence: evidenceBase,
        })
    }
  }

  // --- Search terms burning money with nothing to show -------------------
  // The bar is statistical, not annoyance: ~2x the campaign's observed CPA
  // spent with nothing back is unlikely to be a winner at lead-gen
  // conversion rates. Below that, a term is noise, and negating noise is
  // the over-optimization the research warns about.
  const cpaByCampaign = new Map<string, number>()
  for (const c of campaigns) {
    if (c.conversions30 > 0) cpaByCampaign.set(c.id, c.cost30 / c.conversions30)
  }
  const byCampaign = new Map<
    string,
    { name: string; threshold: number; terms: Array<{ term: string; cost: number; clicks: number }> }
  >()
  for (const row of searchTermRows) {
    const cost = micros(get(row, 'metrics.costMicros'))
    const clicks = num(get(row, 'metrics.clicks'))
    const conversions = num(get(row, 'metrics.conversions'))
    if (conversions > 0) continue
    const campaignId = str(get(row, 'campaign.id'))
    const cpa = cpaByCampaign.get(campaignId)
    const threshold = cpa
      ? Math.max(T.NEGATIVE_CANDIDATE_MIN_SPEND, T.NEGATIVE_CANDIDATE_CPA_MULTIPLE * cpa)
      : T.NEGATIVE_CANDIDATE_MIN_SPEND
    if (cost < threshold || clicks < T.NEGATIVE_CANDIDATE_MIN_CLICKS) continue
    const entry =
      byCampaign.get(campaignId) || { name: str(get(row, 'campaign.name')), threshold, terms: [] }
    entry.terms.push({ term: str(get(row, 'searchTermView.searchTerm')), cost, clicks })
    byCampaign.set(campaignId, entry)
  }
  for (const [id, { name, threshold, terms }] of byCampaign) {
    const sorted = terms.sort((a, b) => b.cost - a.cost).slice(0, 10)
    const total = terms.reduce((a, t) => a + t.cost, 0)
    drafts.push({
      check: 'negative-candidates',
      severity: 'REVIEW',
      entity: `campaign:${id}`,
      title: `${name}: $${total.toFixed(0)} on search terms that never convert`,
      detail: `${terms.length} term${terms.length === 1 ? '' : 's'} each with ≥$${threshold.toFixed(0)} spend (2× this campaign's observed CPA, or the $${T.NEGATIVE_CANDIDATE_MIN_SPEND} floor) and ≥${T.NEGATIVE_CANDIDATE_MIN_CLICKS} clicks over 30 days, zero conversions. Top: ${sorted
        .slice(0, 3)
        .map((t) => `"${t.term}" ($${t.cost.toFixed(0)})`)
        .join(', ')}. Review for negatives — the full list is in the evidence.`,
      evidence: {
        window: 'last 30 days',
        thresholds: {
          spendThreshold: Number(threshold.toFixed(2)),
          basis: `max($${T.NEGATIVE_CANDIDATE_MIN_SPEND}, ${T.NEGATIVE_CANDIDATE_CPA_MULTIPLE}× observed CPA)`,
          minClicks: T.NEGATIVE_CANDIDATE_MIN_CLICKS,
        },
        terms: sorted,
        totalWastedSpend: Number(total.toFixed(2)),
      },
    })
  }

  return { drafts, heldByCooldown: held }
}

export const WEEKLY_CHECKS = [
  'tcpa-before-data',
  'budget-below-target',
  'graduate-bidding',
  'consider-tcpa',
  'search-partners-on',
  'display-expansion-on',
  'geo-interest',
  'pmax-url-expansion',
  'negative-candidates',
]

export interface WeeklyRunSummary extends DailyRunSummary {
  heldByCooldown: Array<{ client: string; campaign: string; rule: string; daysAgo: number }>
}

export async function runWeeklyPlaybook(): Promise<WeeklyRunSummary> {
  const clients = await listAdsClients()
  const summary: WeeklyRunSummary = {
    accounts: clients.length,
    errors: [],
    newFindings: [],
    resolved: 0,
    stillOpen: 0,
    heldByCooldown: [],
  }

  const changeStart = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const changeEnd = new Date().toISOString().slice(0, 10)

  for (const client of clients) {
    const customerId = client.adsTracking?.googleAdsCustomerId as string
    const ranChecks = new Set<string>()

    const campaignRows = await adsSearch(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
              campaign.bidding_strategy_type, campaign.start_date,
              campaign.maximize_conversions.target_cpa_micros,
              campaign.target_cpa.target_cpa_micros,
              campaign.network_settings.target_partner_search_network,
              campaign.network_settings.target_content_network,
              campaign.geo_target_type_setting.positive_geo_target_type,
              campaign.url_expansion_opt_out, campaign_budget.amount_micros,
              metrics.conversions, metrics.cost_micros
       FROM campaign
       WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS`
    )
    if (!campaignRows.ok) {
      summary.errors.push({ client: client.businessName, error: campaignRows.error })
      continue
    }

    // The cooldown source. If it cannot be read, NOTHING is recommended for
    // this account — recommending without knowing what was just changed is
    // the exact failure the cooldown exists to prevent.
    const changeRows = await adsSearch(
      customerId,
      `SELECT change_event.change_date_time, change_event.change_resource_type,
              change_event.changed_fields, change_event.campaign
       FROM change_event
       WHERE change_event.change_date_time >= '${changeStart} 00:00:00'
         AND change_event.change_date_time <= '${changeEnd} 23:59:59'
       LIMIT 2000`
    )
    if (!changeRows.ok) {
      summary.errors.push({
        client: client.businessName,
        error: `change history unreadable, playbook skipped: ${changeRows.error}`,
      })
      continue
    }

    const termRows = await adsSearch(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status, search_term_view.search_term,
              metrics.cost_micros, metrics.clicks, metrics.conversions
       FROM search_term_view
       WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS
         AND metrics.cost_micros > ${PLAYBOOK_THRESHOLDS.NEGATIVE_CANDIDATE_MIN_SPEND * 1_000_000}`
    )
    // Search terms failing is survivable — the other rules still run.
    if (!termRows.ok) {
      summary.errors.push({ client: client.businessName, error: termRows.error })
    }

    const campaigns = parseCampaignRows(campaignRows.rows)
    const cooldowns = parseCooldowns(changeRows.rows)
    const result = evaluatePlaybook(campaigns, cooldowns, termRows.ok ? termRows.rows : [])

    for (const check of WEEKLY_CHECKS) {
      if (check === 'negative-candidates' && !termRows.ok) continue
      ranChecks.add(check)
    }
    await fileFindings(client, customerId, 'WEEKLY', result.drafts, ranChecks, summary)
    summary.heldByCooldown.push(
      ...result.heldByCooldown.map((h) => ({ client: client.businessName, ...h }))
    )
  }

  return summary
}
