import { prisma } from '@/lib/db'
import { adsSearch } from '@/lib/google-ads'
import { getClientActivity } from '@/lib/client-activity'
import { monthLabel, monthWindow } from '@/lib/tz'

/**
 * THE MONTH'S REPORT for one shop: what came in, what the ads cost, what was
 * done, and what is next.
 *
 * WHAT THIS IS NOT. `monthly-report.ts` is the twelve-month trend — leads,
 * booked and revenue by month, all of it the shop's own bookkeeping. This is
 * one month in depth, and it is the thing that gets EMAILED. They live on the
 * same portal page: the trend answers "is this working", the month answers
 * "what happened in February".
 *
 * IT IS SNAPSHOTTED, NOT RECOMPUTED. Ad spend is fetched live from Google Ads
 * everywhere else in this app, which is right for a screen somebody is
 * looking at now and wrong for a report: an email sent on 1 March and the
 * portal page opened in June have to agree, forever, and they cannot if one of
 * them re-asks an API whose numbers move. So the built digest is stored whole
 * (`ClientMonthlyReport.payload`) — the same reason `ClarityDay` keeps the raw
 * payload beside the extracted numbers: a reader bug then costs a recompute
 * rather than a figure nobody can get back.
 *
 * TWO CALENDARS MEET HERE AND BOTH ARE RIGHT. Enquiries are counted in the
 * SHOP'S timezone, because that is the day their phone rang and the window
 * lead-dedup already used. Spend is counted in the GOOGLE ADS ACCOUNT'S
 * timezone, because `segments.date` is account-local and the figure has to
 * reconcile against what the shop sees when they open Google Ads themselves.
 * Where the two zones differ the windows differ by a few hours at each edge.
 * That is a real difference, it is small, and it is better than a number that
 * matches nothing.
 */

/** Canonical enquiries — see the note on `byChannel`. */
export interface DigestEnquiries {
  /**
   * Canonical leads in the month. Duplicates excluded: a second submission
   * from the same person on the same day is not a second job.
   */
  total: number
  /**
   * HOW THOSE ARRIVED — A PARTITION OF `total`, NEVER AN ADDITION TO IT.
   *
   * A tracked call writes a Lead (`source: 'PHONE'`, see call-lead.ts) and so
   * does a text (`SMS`), so the channels sum to `total` by construction.
   * Counting `CallAnalysis` rows on top — which is what the twelve-month
   * trend shows in its own separate column — would double every phone
   * enquiry, and the first place that shows is cost per conversion looking
   * half what it is.
   */
  byChannel: { form: number; phone: number; sms: number; other: number }
  booked: number
  lost: number
  open: number
  revenue: number
}

export interface DigestCampaign {
  name: string
  status: string
  spend: number
  clicks: number
  impressions: number
  conversions: number
  costPerConversion: number | null
}

export interface DigestKeyword {
  text: string
  matchType: string
  campaign: string
  spend: number
  clicks: number
  conversions: number
}

export interface DigestAds {
  customerId: string
  spend: number
  clicks: number
  impressions: number
  /**
   * GOOGLE'S OWN CONVERSION COUNT, and the report says so on the page.
   *
   * Not our lead count. They measure different things and will not agree:
   * Google counts only what it can attribute to an ad click, so an organic or
   * direct enquiry is absent from it, and it counts fractionally and by click
   * date rather than by the date the phone rang. Dividing spend by OUR total
   * enquiries would produce a cost per conversion that reconciles against
   * nothing — the shop opens Google Ads, sees a different number, and stops
   * trusting the whole report.
   *
   * Worth knowing when a figure looks too good: an account still carrying
   * HighLevel's legacy `AGMP Call` alongside this app's `AGMP Website Call`
   * counts one phone call twice (see docs/GOOGLE-ADS-SETUP.md), which inflates
   * conversions and therefore flatters cost per conversion. The migration
   * order in that doc is what fixes it; nothing here can detect it.
   */
  conversions: number
  costPerConversion: number | null
  campaigns: DigestCampaign[]
  /** Top spenders. A shop with four keywords sees four. */
  keywords: DigestKeyword[]
}

export interface DigestWork {
  at: string
  kind: string
  title: string
  detail?: string
}

export interface DigestNextStep {
  title: string
  detail: string
  severity: string
}

export interface MonthlyDigest {
  clientId: string
  businessName: string
  year: number
  month: number
  label: string
  timezone: string
  /** The window actually used, so a stored digest can be re-read exactly. */
  from: string
  to: string
  enquiries: DigestEnquiries
  /** Null for a self-serve client: no ads account, so no spend to report. */
  ads: DigestAds | null
  /**
   * Why the ads section is missing when it should not be.
   *
   * An absence and a failure are different facts and only one of them is
   * about the shop — the mistake `place-location.ts` records. A report that
   * silently drops the spend section during an API outage reads as "we spent
   * nothing on your ads last month".
   */
  adsError?: string
  work: DigestWork[]
  nextSteps: DigestNextStep[]
  /** The operator's own words. Never generated. */
  note: string | null
}

const KEYWORD_LIMIT = 20
const micros = (v: unknown) => Number(v || 0) / 1_000_000
const num = (v: unknown) => Number(v || 0)

/** `2026-02-01`, as Google Ads' `segments.date` wants it. */
function adsDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Last day of a month, without constructing a timezone-sensitive Date. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 0)).getUTCDate()
}

/**
 * Turn Google Ads campaign and keyword rows into the ads section.
 *
 * PURE, and separate from the fetch, for the same reason
 * `compareToStandard()` is: the arithmetic can then be checked against saved
 * rows from a real account with no credentials present — which is the only way
 * it gets checked at all, since nothing local can reach Google Ads.
 */
export function summariseAds(
  customerId: string,
  campaignRows: Record<string, unknown>[],
  keywordRows: Record<string, unknown>[]
): DigestAds {
  const campaigns: DigestCampaign[] = campaignRows.map((row) => {
    const campaign = (row.campaign || {}) as Record<string, unknown>
    const metrics = (row.metrics || {}) as Record<string, unknown>
    const spend = micros(metrics.costMicros ?? metrics.cost_micros)
    const conversions = num(metrics.conversions)
    return {
      name: String(campaign.name || 'Unnamed campaign'),
      status: String(campaign.status || 'UNKNOWN'),
      spend,
      clicks: num(metrics.clicks),
      impressions: num(metrics.impressions),
      conversions,
      costPerConversion: conversions > 0 ? spend / conversions : null,
    }
  })

  /* THE ACCOUNT TOTALS ARE THE SUM OF THE CAMPAIGN ROWS, not a second query.
     One query means the parts can never disagree with the whole — and a total
     fetched separately WOULD disagree, because a campaign removed mid-month
     still carries spend that a campaign-level query with a status filter
     drops. There is no status filter here for exactly that reason: money
     spent by a campaign since paused is money the shop spent. */
  const spend = campaigns.reduce((s, c) => s + c.spend, 0)
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0)

  const keywords: DigestKeyword[] = keywordRows
    .map((row) => {
      const criterion = (row.adGroupCriterion || row.ad_group_criterion || {}) as Record<
        string,
        unknown
      >
      const keyword = (criterion.keyword || {}) as Record<string, unknown>
      const campaign = (row.campaign || {}) as Record<string, unknown>
      const metrics = (row.metrics || {}) as Record<string, unknown>
      return {
        text: String(keyword.text || ''),
        matchType: String(keyword.matchType ?? keyword.match_type ?? ''),
        campaign: String(campaign.name || ''),
        spend: micros(metrics.costMicros ?? metrics.cost_micros),
        clicks: num(metrics.clicks),
        conversions: num(metrics.conversions),
      }
    })
    // A keyword that cost nothing and did nothing is a row the shop has to
    // read past. Ordered by spend, because that is the question being asked.
    .filter((k) => k.text && (k.spend > 0 || k.clicks > 0))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, KEYWORD_LIMIT)

  return {
    customerId,
    spend,
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    conversions,
    costPerConversion: conversions > 0 ? spend / conversions : null,
    campaigns: campaigns.filter((c) => c.spend > 0 || c.clicks > 0).sort((a, b) => b.spend - a.spend),
    keywords,
  }
}

/** Count canonical leads into the shape the report renders. */
export function summariseEnquiries(
  leads: Array<{ source: string; status: string; saleValue: number | null }>
): DigestEnquiries {
  const out: DigestEnquiries = {
    total: leads.length,
    byChannel: { form: 0, phone: 0, sms: 0, other: 0 },
    booked: 0,
    lost: 0,
    open: 0,
    revenue: 0,
  }
  for (const lead of leads) {
    if (lead.source === 'FORM') out.byChannel.form++
    else if (lead.source === 'PHONE') out.byChannel.phone++
    else if (lead.source === 'SMS') out.byChannel.sms++
    else out.byChannel.other++

    if (lead.status === 'SOLD') {
      out.booked++
      out.revenue += lead.saleValue || 0
    } else if (lead.status === 'LOST') out.lost++
    else out.open++
  }
  return out
}

/**
 * Fetch the ads half. Returns the error rather than throwing: a report is
 * still worth sending without it, and the missing section has to be able to
 * say WHY it is missing.
 */
async function fetchAds(
  customerId: string,
  year: number,
  month: number
): Promise<{ ads: DigestAds } | { error: string }> {
  const from = adsDate(year, month, 1)
  const to = adsDate(year, month, daysInMonth(year, month))
  const [campaignResult, keywordResult] = await Promise.all([
    adsSearch(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status,
              metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
       FROM campaign
       WHERE segments.date BETWEEN '${from}' AND '${to}'`
    ),
    adsSearch(
      customerId,
      `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
              campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions
       FROM keyword_view
       WHERE segments.date BETWEEN '${from}' AND '${to}'
       ORDER BY metrics.cost_micros DESC
       LIMIT 200`
    ),
  ])

  // The campaign query carries the spend, so its failure is the section's
  // failure. A keyword query that fails costs the keyword table alone —
  // reporting no spend because a secondary query broke would be worse.
  if (!campaignResult.ok) return { error: campaignResult.error }
  return {
    ads: summariseAds(
      customerId,
      campaignResult.rows,
      keywordResult.ok ? keywordResult.rows : []
    ),
  }
}

/**
 * Build the digest for one client and one month.
 *
 * Reads only. Storing it is the caller's job, so this can be run to look at
 * an answer without committing to it — the same reason the conversion audit
 * reads and never fixes.
 */
export async function buildMonthlyDigest(
  clientId: string,
  year: number,
  month: number
): Promise<{ ok: true; digest: MonthlyDigest } | { ok: false; error: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      timezone: true,
      adsTracking: { select: { googleAdsCustomerId: true } },
    },
  })
  if (!client) return { ok: false, error: 'Client not found' }

  const timezone = client.timezone || 'America/Denver'
  const { start, end } = monthWindow(year, month, timezone)

  const [leads, activity, findings] = await Promise.all([
    prisma.lead
      .findMany({
        // Canonical rows only. `lt end` because the month window's end is
        // exclusive — see lib/tz.
        where: { clientId, duplicateOfLeadId: null, createdAt: { gte: start, lt: end } },
        select: { source: true, status: true, saleValue: true },
      })
      .catch(() => []),
    getClientActivity(clientId).catch(() => []),
    prisma.adsFinding
      .findMany({
        /* NEXT STEPS COME FROM THE FINDINGS THAT ALREADY EXIST, not from a
           model asked to write advice. The daily and weekly sweeps file
           structured claims with their evidence attached and their own
           cooldowns; a fresh model call would invent a fourth version of the
           same opinion, monthly, addressed to a real business owner. DISMISSED
           rows are excluded because "known, stop telling me" means the
           operator has answered them. */
        where: { clientId, status: { in: ['OPEN', 'REOPENED'] } },
        select: { title: true, detail: true, severity: true, lastSeenAt: true },
        orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }],
        take: 5,
      })
      .catch(() => []),
  ])

  const customerId = client.adsTracking?.googleAdsCustomerId || null
  let ads: DigestAds | null = null
  let adsError: string | undefined
  if (customerId) {
    const result = await fetchAds(customerId, year, month)
    if ('ads' in result) ads = result.ads
    else adsError = result.error
  }

  /* The activity feed is already grouped by month and derived from things that
     happened, so this is a filter rather than a second source of truth.

     EXCEPT FOR ITS OWN LEAD AND CALL TALLIES, WHICH ARE DROPPED. Two reasons,
     and the second was found by reading a real build rather than reasoning
     about it:

     - They are not work WE did. "7 enquiries delivered" is the subject of the
       Enquiries section three inches higher up; repeating it under "what we
       did" pads the list with the thing the report already led on.
     - THEY DISAGREE, because the feed buckets by UTC month and this report
       buckets by the SHOP'S month. On the first build, a lead created at
       23:30 on 31 July in Los Angeles landed in the feed's August and this
       report's July — so the email would have said "6 enquiries" at the top
       and "7 enquiries delivered" in the list below it. A shop who spots two
       numbers for one fact in the same email stops believing both. */
  const OWN_TALLIES = new Set(['leads', 'calls'])
  const work = activity
    .flatMap((m) => m.items)
    .filter((item) => item.at >= start && item.at < end && !OWN_TALLIES.has(item.kind))
    .map((item) => ({
      at: item.at.toISOString(),
      kind: item.kind,
      title: item.title,
      ...(item.detail ? { detail: item.detail } : {}),
    }))

  return {
    ok: true,
    digest: {
      clientId: client.id,
      businessName: client.businessName,
      year,
      month,
      label: monthLabel(year, month),
      timezone,
      from: start.toISOString(),
      to: end.toISOString(),
      enquiries: summariseEnquiries(leads),
      ads,
      ...(adsError ? { adsError } : {}),
      work,
      nextSteps: findings.map((f) => ({
        title: f.title,
        detail: f.detail,
        severity: f.severity,
      })),
      note: null,
    },
  }
}
