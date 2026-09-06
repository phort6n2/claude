import { adsSearch } from '@/lib/google-ads'
import { CONVERSION_STANDARD, type ConversionAudit } from '@/lib/google-ads-conventions'
import type { FindingDraft } from '@/lib/google-ads-checks'

/**
 * Are the campaigns actually BIDDING to the AGMP conversions?
 *
 * The conversion audit next door answers "does this account have the four
 * actions, named and configured the way every other account is". That can be
 * a clean pass while every live campaign optimises to something else
 * entirely, because biddability is not a property of the action — it is a
 * property of a CATEGORY~ORIGIN goal, and a campaign may either follow the
 * account defaults or carry its OWN set of goals that overrides them.
 *
 * That is not a hypothetical. On the account this was written against, all
 * four live campaigns are at goal_config_level CAMPAIGN and bid on
 * PHONE_CALL_LEAD~CALL_FROM_ADS, CONTACT~CALL_FROM_ADS and
 * CONVERTED_LEAD~WEBSITE — so the quote form on the hosted site, reported
 * faithfully by AGMP Lead Form into SUBMIT_LEAD_FORM~WEBSITE, is measured and
 * then ignored by Smart Bidding on every campaign that spends money. The
 * account-level audit cannot see this: the customer goal is only what a
 * campaign inherits IF it inherits anything.
 *
 * It is also invisible in the Ads UI unless you open each campaign's own
 * conversion-goal panel and read it against a list of what should be there.
 * Nothing about the campaign looks wrong; the conversions arrive, the column
 * fills in, and the bidding is steering by a different signal.
 *
 * WHAT IS NOT REPORTED. An action the account does not have yet — the
 * conversion audit already says "missing", and following that up with "and it
 * is not a goal on four campaigns" is four more lines about the same absence.
 * And AGMP Sale is expected to be Secondary (§ CONVERSION_STANDARD), so a
 * campaign NOT bidding on PURCHASE is correct, not a finding; a campaign that
 * IS bidding on it before the shop has value-bidding volume is.
 */

type Row = Record<string, unknown>

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/**
 * Read a field that the REST API returns camelCase and a protobuf client
 * returns snake_case. The app is on REST; fixtures captured from a protobuf
 * client (which is how the live rows behind the tests were pulled) are
 * snake_case, and a reader that only understands one of them silently sees an
 * empty account.
 */
const pick = (obj: Row | undefined, ...names: string[]): unknown => {
  if (!obj) return undefined
  for (const name of names) if (obj[name] !== undefined) return obj[name]
  return undefined
}

const sub = (row: Row, ...names: string[]): Row | undefined => {
  for (const name of names) {
    const v = row[name]
    if (v && typeof v === 'object') return v as Row
  }
  return undefined
}

/** The last path segment of a resource name — the id. */
const idOf = (resourceName: unknown): string => str(resourceName).split('/').pop() || ''

export interface StandardActionRef {
  /** CONVERSION_STANDARD key. */
  key: string
  name: string
  /** category~origin — what biddability is actually set on. */
  goalKey: string
  /** Must this drive bidding, or be held Secondary? */
  shouldBid: boolean
  /** Present when the account really has this action today. */
  actionId?: string
}

/**
 * Which of the four exist in this account, from the conversion audit.
 *
 * A `rename` counts as existing: the action is there in the right category
 * under the wrong name, so its goal is exactly as (ir)relevant to bidding as
 * it would be after the rename. Same for `duplicate` — several of them are
 * there. Only `missing` drops out.
 */
export function standardRefsFrom(audit: ConversionAudit): StandardActionRef[] {
  return CONVERSION_STANDARD.map((spec) => {
    const finding = audit.findings.find((f) => f.key === spec.key)
    const exists = !!finding && finding.state !== 'missing'
    return {
      key: spec.key,
      name: spec.name,
      goalKey: `${spec.category}~${spec.origin}`,
      shouldBid: spec.biddable,
      actionId: exists ? finding?.actionId : undefined,
      exists,
    }
  })
    .filter((r) => r.exists)
    .map(({ key, name, goalKey, shouldBid, actionId }) => ({
      key,
      name,
      goalKey,
      shouldBid,
      actionId,
    }))
}

export interface CampaignGoalView {
  campaignId: string
  name: string
  channel: string
  /** CUSTOMER = follows the account defaults. CAMPAIGN = its own set. */
  level: 'CUSTOMER' | 'CAMPAIGN' | 'UNKNOWN'
  /** Set when this campaign uses a named custom goal instead of categories. */
  customGoalName?: string
  /** AGMP actions that drive bidding on this campaign. */
  bidding: string[]
  /** Exists in the account, should drive bidding here, and does not. */
  ignored: string[]
  /** Held Secondary by the standard, bidding here anyway. */
  premature: string[]
  /** One sentence an operator can act on, or null when the campaign is fine. */
  problem: string | null
  /** Where the fix is made, given how this campaign gets its goals. */
  fixWhere: string
}

export interface CampaignGoalReport {
  campaigns: CampaignGoalView[]
  /** The subset with something wrong. */
  problems: CampaignGoalView[]
  ok: boolean
  /** Set when nothing could be judged, with the reason. */
  note: string | null
}

const CAMPAIGN_FIX =
  'Fix it on the campaign: Campaign → Settings → Conversion goals (this campaign carries its own set, so the account default does not reach it).'
const CUSTOMER_FIX =
  'This campaign follows the account defaults, so the fix is at Goals → Conversions → Settings — and it moves every other campaign that follows them too.'

/**
 * The comparison, with no network in it.
 *
 * Pure so the rules can be re-run against saved rows from a real account —
 * scripts/check-campaign-goals.ts does exactly that with the rows this was
 * written against.
 */
export function evaluateCampaignGoals(input: {
  refs: StandardActionRef[]
  /** conversion_goal_campaign_config joined to campaign. */
  configRows: Row[]
  /** campaign_conversion_goal rows — biddable ones are enough. */
  campaignGoalRows: Row[]
  /** customer_conversion_goal rows, for campaigns that inherit. */
  customerGoalRows: Row[]
  /** custom_conversion_goal rows, when any campaign uses one. */
  customGoalRows?: Row[]
}): CampaignGoalReport {
  const { refs } = input
  if (refs.length === 0) {
    return {
      campaigns: [],
      problems: [],
      ok: true,
      note: 'None of the four conversion actions exists in this account yet, so there is nothing for a campaign to bid on. The checklist above is the first step.',
    }
  }

  // Account defaults: biddable is OMITTED when false (protobuf drops default
  // values), so a missing key means Secondary, not unknown.
  const customerBiddable = new Set<string>()
  for (const row of input.customerGoalRows) {
    const g = sub(row, 'customerConversionGoal', 'customer_conversion_goal')
    if (!g) continue
    if (pick(g, 'biddable') === true) {
      customerBiddable.add(`${str(pick(g, 'category'))}~${str(pick(g, 'origin'))}`)
    }
  }

  const perCampaign = new Map<string, Set<string>>()
  for (const row of input.campaignGoalRows) {
    const g = sub(row, 'campaignConversionGoal', 'campaign_conversion_goal')
    if (!g) continue
    if (pick(g, 'biddable') !== true) continue
    const id = idOf(pick(g, 'campaign'))
    if (!id) continue
    const set = perCampaign.get(id) || new Set<string>()
    set.add(`${str(pick(g, 'category'))}~${str(pick(g, 'origin'))}`)
    perCampaign.set(id, set)
  }

  // Custom goals name ACTIONS, not categories, so membership is by resource
  // name — and an action id that is not in the list is not bid on however its
  // category is set.
  const customGoals = new Map<string, { name: string; actionIds: Set<string> }>()
  for (const row of input.customGoalRows || []) {
    const g = sub(row, 'customConversionGoal', 'custom_conversion_goal')
    if (!g) continue
    const id = str(pick(g, 'id')) || idOf(pick(g, 'resourceName', 'resource_name'))
    const actions = pick(g, 'conversionActions', 'conversion_actions')
    customGoals.set(id, {
      name: str(pick(g, 'name')) || id,
      actionIds: new Set((Array.isArray(actions) ? actions : []).map((a) => idOf(a))),
    })
  }

  const campaigns: CampaignGoalView[] = []

  for (const row of input.configRows) {
    const config = sub(row, 'conversionGoalCampaignConfig', 'conversion_goal_campaign_config')
    const campaign = sub(row, 'campaign')
    if (!config || !campaign) continue

    const campaignId = str(pick(campaign, 'id')) || idOf(pick(config, 'campaign'))
    const name = str(pick(campaign, 'name')) || campaignId
    const channel = str(pick(campaign, 'advertisingChannelType', 'advertising_channel_type'))
    const rawLevel = str(pick(config, 'goalConfigLevel', 'goal_config_level'))
    const level: CampaignGoalView['level'] =
      rawLevel === 'CAMPAIGN' ? 'CAMPAIGN' : rawLevel === 'CUSTOMER' ? 'CUSTOMER' : 'UNKNOWN'
    const customGoalId = idOf(pick(config, 'customConversionGoal', 'custom_conversion_goal'))
    const customGoal = customGoalId ? customGoals.get(customGoalId) : undefined

    const bidding: string[] = []
    const ignored: string[] = []
    const premature: string[] = []
    let problem: string | null = null
    const fixWhere = level === 'CUSTOMER' ? CUSTOMER_FIX : CAMPAIGN_FIX

    if (customGoalId && !customGoal) {
      // Named but unreadable. Saying nothing here would report a campaign as
      // fine on the strength of a list we never saw.
      campaigns.push({
        campaignId,
        name,
        channel,
        level,
        customGoalName: customGoalId,
        bidding,
        ignored,
        premature,
        problem: `This campaign bids to a custom goal (${customGoalId}) whose contents could not be read, so whether it includes the AGMP actions is unknown. Open the campaign's conversion goals and check by eye.`,
        fixWhere,
      })
      continue
    }

    if (level === 'UNKNOWN') {
      campaigns.push({
        campaignId,
        name,
        channel,
        level,
        bidding,
        ignored,
        premature,
        problem: `Google did not say whether this campaign uses the account goals or its own (goal_config_level was empty), so its bidding signals could not be judged.`,
        fixWhere,
      })
      continue
    }

    const biddableKeys =
      level === 'CAMPAIGN' ? perCampaign.get(campaignId) || new Set<string>() : customerBiddable

    for (const ref of refs) {
      const bids = customGoal
        ? !!ref.actionId && customGoal.actionIds.has(ref.actionId)
        : biddableKeys.has(ref.goalKey)
      if (bids) bidding.push(ref.name)
      if (ref.shouldBid && !bids) ignored.push(ref.name)
      if (!ref.shouldBid && bids) premature.push(ref.name)
    }

    if (ignored.length) {
      problem =
        `${ignored.join(', ')} ${ignored.length === 1 ? 'is' : 'are'} measured on this campaign and not bid on — ` +
        `${ignored.length === 1 ? 'its goal is' : 'their goals are'} Secondary here, so Smart Bidding optimises as if ${ignored.length === 1 ? 'that lead' : 'those leads'} never happened. ${fixWhere}`
    } else if (premature.length) {
      problem = `${premature.join(', ')} is Primary on this campaign. The standard holds it Secondary until this shop has the volume for value bidding — bidding to it now makes the bidding worse, not better. ${fixWhere}`
    }

    campaigns.push({
      campaignId,
      name,
      channel,
      level,
      customGoalName: customGoal?.name,
      bidding,
      ignored,
      premature,
      problem,
      fixWhere,
    })
  }

  campaigns.sort((a, b) => a.name.localeCompare(b.name))
  const problems = campaigns.filter((c) => c.problem)
  return {
    campaigns,
    problems,
    ok: problems.length === 0,
    note: campaigns.length
      ? null
      : 'No enabled campaigns in this account, so there is nothing bidding to these conversions yet.',
  }
}

export const CAMPAIGN_GOAL_CHECK = 'campaign-goal-ignored'

/**
 * The same report as findings, for the weekly sweep.
 *
 * WEEKLY rather than daily: this is a structural setting that somebody
 * changed once, not an anomaly that started overnight, and the daily digest
 * only stays scary while everything in it is urgent. One finding per
 * campaign, keyed on the campaign, so a persisting misconfiguration is ONE
 * row whose lastSeenAt moves rather than a new row every Sunday.
 */
export function campaignGoalDrafts(report: CampaignGoalReport): FindingDraft[] {
  return report.problems.map((c) => ({
    check: CAMPAIGN_GOAL_CHECK,
    // Not an ALERT: nothing is on fire tonight, and it has usually been this
    // way for months. It is money spent steering by the wrong signal, which
    // is a thing to read at the desk and fix deliberately.
    severity: 'REVIEW' as const,
    entity: `campaign:${c.campaignId}`,
    title: c.ignored.length
      ? `${c.name}: bidding ignores ${c.ignored.join(', ')}`
      : c.premature.length
        ? `${c.name}: bidding on ${c.premature.join(', ')} before it should`
        : `${c.name}: conversion goals could not be judged`,
    detail: c.problem || '',
    evidence: {
      campaignId: c.campaignId,
      channel: c.channel,
      goalSource: c.level === 'CAMPAIGN' ? 'campaign-specific goals' : 'account-default goals',
      customGoal: c.customGoalName || null,
      biddingTo: c.bidding,
      ignored: c.ignored,
      premature: c.premature,
    },
  }))
}

/**
 * Read the live account and run the comparison.
 *
 * Four queries at most, and the fourth only when a campaign actually uses a
 * custom goal. Enabled campaigns only: a paused campaign's goals cost nothing
 * and telling somebody to go and fix one is noise — the same rule the landing
 * pages check uses.
 */
export async function auditCampaignGoals(
  customerId: string,
  refs: StandardActionRef[]
): Promise<{ ok: true; report: CampaignGoalReport } | { ok: false; error: string }> {
  const config = await adsSearch(
    customerId,
    `SELECT conversion_goal_campaign_config.campaign,
            conversion_goal_campaign_config.goal_config_level,
            conversion_goal_campaign_config.custom_conversion_goal,
            campaign.id, campaign.name, campaign.advertising_channel_type
     FROM conversion_goal_campaign_config
     WHERE campaign.status = 'ENABLED'`
  )
  if (!config.ok) return config

  // Only the biddable rows are needed: a goal that is not in this list is not
  // bid on, and asking for all of them returns every category Google knows
  // about for every campaign — 149 rows against 12 on a two-campaign account.
  const campaignGoals = await adsSearch(
    customerId,
    `SELECT campaign_conversion_goal.campaign,
            campaign_conversion_goal.category,
            campaign_conversion_goal.origin,
            campaign_conversion_goal.biddable
     FROM campaign_conversion_goal
     WHERE campaign.status = 'ENABLED' AND campaign_conversion_goal.biddable = TRUE`
  )
  if (!campaignGoals.ok) return campaignGoals

  const customerGoals = await adsSearch(
    customerId,
    `SELECT customer_conversion_goal.category,
            customer_conversion_goal.origin,
            customer_conversion_goal.biddable
     FROM customer_conversion_goal`
  )
  if (!customerGoals.ok) return customerGoals

  const usesCustomGoal = config.rows.some((row) => {
    const c = sub(row, 'conversionGoalCampaignConfig', 'conversion_goal_campaign_config')
    return !!idOf(pick(c, 'customConversionGoal', 'custom_conversion_goal'))
  })
  const customGoals = usesCustomGoal
    ? await adsSearch(
        customerId,
        `SELECT custom_conversion_goal.id,
                custom_conversion_goal.name,
                custom_conversion_goal.conversion_actions
         FROM custom_conversion_goal`
      )
    : null

  return {
    ok: true,
    report: evaluateCampaignGoals({
      refs,
      configRows: config.rows,
      campaignGoalRows: campaignGoals.rows,
      customerGoalRows: customerGoals.rows,
      customGoalRows: customGoals?.ok ? customGoals.rows : undefined,
    }),
  }
}
