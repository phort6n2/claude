import type { SearchReport, TrafficReport, TrafficSeries } from '@/lib/site-analytics'

/**
 * A SAMPLE of the Traffic report, for a shop without SEO.
 *
 * The page used to describe the report in four cards of prose — "who arrives,
 * and from where", "what they searched for". A shop owner who has never seen
 * the report cannot picture it from a description, and the report IS the
 * product being offered. So they see the real component, rendered from
 * numbers in exactly the shape Google's would arrive in.
 *
 * EVERY NUMBER HERE IS MADE UP, AND THE PAGE SAYS SO — which is the whole of
 * what makes this allowed. The rest of this page runs on "nothing estimated,
 * Google's own numbers", so the sample:
 *  - belongs to an obviously fictional shop ("Example Auto Glass" on
 *    example-autoglass.com, a reserved-looking address), never the viewer's
 *    own name, city or site — seeing their name above invented numbers is how
 *    a sample gets mistaken for a report;
 *  - is rendered inside a frame labelled SAMPLE, with the "straight from
 *    Google" line replaced (TrafficReport's `sample` prop);
 *  - is modest. A sample that shows a local shop tripling its traffic is a
 *    promise wearing a costume; this one shows the ordinary shape of a shop's
 *    quarter, with a gain small enough to be unremarkable and a search that
 *    slipped back, because the real report shows those too.
 *
 * DETERMINISTIC: a seeded generator, so the numbers do not reshuffle between
 * visits (which would read as broken), and the dates end yesterday so the
 * chart looks current.
 */

const SITE = 'https://example-autoglass.com'
const DAYS = 90

/** Small seeded PRNG — the same sample every time. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dates(count: number, endOffsetDays: number, now: Date): string[] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  end.setUTCDate(end.getUTCDate() - endOffsetDays)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(end.getUTCDate() - i)
    out.push(isoDay(d))
  }
  return out
}

function shares<T extends { value: number }>(rows: T[]): Array<T & { share: number }> {
  const total = rows.reduce((sum, r) => sum + r.value, 0) || 1
  return rows.map((r) => ({ ...r, share: Math.round((r.value / total) * 1000) / 10 }))
}

/** A weekday-heavy daily count around `base`, drifting gently upward. */
function daily(rand: () => number, day: string, i: number, base: number): number {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  const weekday = dow === 0 ? 0.55 : dow === 6 ? 0.75 : 1.1
  const trend = 0.9 + (0.2 * i) / DAYS
  return Math.max(0, Math.round(base * weekday * trend * (0.85 + rand() * 0.3)))
}

export function sampleTrafficReport(now = new Date()): {
  siteUrl: string
  traffic: TrafficReport
  search: SearchReport
} {
  const rand = mulberry32(20260927)
  const days = dates(DAYS, 1, now)

  // --- All traffic ---------------------------------------------------------
  // GA4's own channel names; the chart and bars translate them for display.
  const channelBase: Array<[string, number]> = [
    ['Organic Search', 8.5],
    ['Direct', 5.2],
    ['Paid Search', 4.1],
    ['Referral', 1.3],
    ['Organic Social', 0.8],
  ]
  const points = days.map((date, i) => ({
    date,
    values: channelBase.map(([, base]) => daily(rand, date, i, base)),
  }))
  const series: TrafficSeries = { bucket: 'day', names: channelBase.map(([n]) => n), points }
  const totals = channelBase.map((_, c) => points.reduce((sum, p) => sum + p.values[c], 0))
  const everyone = totals.reduce((a, b) => a + b, 0)
  const organic = totals[0]
  // Someone who came two ways counts in both channels, so people < the sum.
  const activeUsers = Math.round(everyone * 0.92)

  const aiNames = ['ChatGPT', 'Gemini', 'Perplexity']
  const aiPoints = days.map((date) => ({
    date,
    values: aiNames.map((_, n) => (rand() < [0.14, 0.06, 0.03][n] ? 1 : 0)),
  }))
  const aiTotals = aiNames.map((_, n) => aiPoints.reduce((sum, p) => sum + p.values[n], 0))
  const aiUsers = aiTotals.reduce((a, b) => a + b, 0)

  const traffic: TrafficReport = {
    activeUsers,
    sessions: Math.round(everyone * 1.24),
    organicUsers: organic,
    previous: {
      activeUsers: Math.round(activeUsers * 0.88),
      sessions: Math.round(everyone * 1.24 * 0.9),
      organicUsers: Math.round(organic * 0.84),
      aiUsers: Math.max(0, aiUsers - 4),
      comparable: true,
    },
    windowDays: DAYS,
    daily: points.map((p) => ({ date: p.date, value: p.values.reduce((a, b) => a + b, 0) })),
    series,
    channels: shares(channelBase.map(([name], c) => ({ name, value: totals[c] }))),
    topSources: shares([
      { name: 'google', value: Math.round(organic * 0.86 + totals[2]) },
      { name: '(direct)', value: totals[1] },
      { name: 'bing', value: Math.round(organic * 0.1) },
      { name: 'yelp.com', value: Math.round(totals[3] * 0.55) },
      { name: 'facebook.com', value: totals[4] },
      { name: 'chatgpt.com', value: aiTotals[0] },
    ]),
    aiSources: shares(aiNames.map((name, n) => ({ name, value: aiTotals[n] }))),
    aiUsers,
    aiSessions: aiUsers + 3,
    aiSeries: { bucket: 'day', names: aiNames, points: aiPoints },
    aiTopPages: shares([
      { page: '/', value: Math.ceil(aiUsers * 0.5), topModel: 'ChatGPT' },
      { page: '/windshield-replacement', value: Math.ceil(aiUsers * 0.3), topModel: 'ChatGPT' },
      { page: '/insurance-glass-claims', value: Math.floor(aiUsers * 0.2), topModel: 'Gemini' },
    ]).map(({ page, value, share, topModel }) => ({ page, users: value, share, topModel })),
    topPages: shares([
      { page: '/', value: Math.round(activeUsers * 0.38), topSource: 'google' },
      { page: '/windshield-replacement', value: Math.round(activeUsers * 0.21), topSource: 'google' },
      { page: '/windshield-repair', value: Math.round(activeUsers * 0.12), topSource: 'google' },
      { page: '/mobile-auto-glass', value: Math.round(activeUsers * 0.08), topSource: 'google' },
      { page: '/insurance-glass-claims', value: Math.round(activeUsers * 0.06), topSource: 'google' },
      { page: '/side-window-replacement', value: Math.round(activeUsers * 0.04), topSource: '(direct)' },
    ]).map(({ page, value, share, topSource }) => ({ page, users: value, share, topSource })),
  }

  // --- Google search ---------------------------------------------------------
  // Search Console runs two to three days behind, so its window ends earlier.
  const searchDays = dates(DAYS - 3, 3, now)
  const searchDaily = searchDays.map((date, i) => {
    const impressions = daily(rand, date, i, 240)
    const clicks = Math.round(impressions * (0.025 + rand() * 0.006))
    return { date, clicks, impressions, position: Math.round((12 + rand() * 5) * 10) / 10 }
  })
  const clicks = searchDaily.reduce((sum, d) => sum + d.clicks, 0)
  const impressions = searchDaily.reduce((sum, d) => sum + d.impressions, 0)

  const topQueries = [
    { query: 'windshield replacement near me', clicks: 64, impressions: 2410, position: 6.8 },
    { query: 'example auto glass', clicks: 58, impressions: 140, position: 1.1 },
    { query: 'auto glass repair near me', clicks: 41, impressions: 1980, position: 8.2 },
    { query: 'windshield repair', clicks: 29, impressions: 1650, position: 9.4 },
    { query: 'rock chip repair near me', clicks: 22, impressions: 760, position: 5.9 },
    { query: 'mobile windshield replacement', clicks: 18, impressions: 690, position: 7.3 },
    { query: 'car window replacement', clicks: 14, impressions: 1120, position: 11.6 },
    { query: 'windshield replacement cost', clicks: 11, impressions: 1340, position: 13.2 },
    { query: 'back glass replacement', clicks: 9, impressions: 410, position: 8.9 },
    { query: 'example auto glass reviews', clicks: 7, impressions: 38, position: 1.4 },
  ]

  const search: SearchReport = {
    days: DAYS,
    coveredDays: searchDays.length,
    clicks,
    impressions,
    averagePosition: 14.2,
    previous: {
      clicks: Math.round(clicks * 0.83),
      impressions: Math.round(impressions * 0.86),
      averagePosition: 15.1,
    },
    daily: searchDaily,
    series: {
      bucket: 'day',
      names: ['Clicks', 'Impressions'],
      points: searchDaily.map((d) => ({ date: d.date, values: [d.clicks, d.impressions] })),
    },
    countries: [{ name: 'United States', value: clicks, share: 100 }],
    topQueries,
    topPages: [
      { page: `${SITE}/`, clicks: Math.round(clicks * 0.34), impressions: Math.round(impressions * 0.22), ctr: 3.9, position: 9.8 },
      { page: `${SITE}/windshield-replacement`, clicks: Math.round(clicks * 0.26), impressions: Math.round(impressions * 0.24), ctr: 2.8, position: 11.4 },
      { page: `${SITE}/windshield-repair`, clicks: Math.round(clicks * 0.14), impressions: Math.round(impressions * 0.15), ctr: 2.4, position: 12.9 },
      { page: `${SITE}/mobile-auto-glass`, clicks: Math.round(clicks * 0.09), impressions: Math.round(impressions * 0.08), ctr: 2.9, position: 10.7 },
      { page: `${SITE}/insurance-glass-claims`, clicks: Math.round(clicks * 0.06), impressions: Math.round(impressions * 0.09), ctr: 1.7, position: 16.3 },
    ],
    // Scaled from the total so the "could not be put on either side" line
    // reads like a real site's (Google names most clicks, not all of them).
    brand: {
      terms: ['example auto glass'],
      brandedClicks: Math.round(clicks * 0.2),
      brandedImpressions: 178,
      nonBrandedClicks: Math.round(clicks * 0.62),
      nonBrandedImpressions: 10360,
      previousNonBrandedClicks: Math.round(clicks * 0.62 * 0.82),
      brandedQueries: 4,
      nonBrandedQueries: 183,
    },
    bands: [
      { label: 'Top 3', hint: 'the first three results', count: 9, previousCount: 6 },
      { label: 'Rest of page one', hint: 'still on the first page', count: 31, previousCount: 25 },
      { label: 'Page two', hint: 'one scroll further', count: 47, previousCount: 44 },
      { label: 'Page three or worse', hint: 'almost nobody looks here', count: 100, previousCount: 97 },
    ],
    movers: {
      comparable: true,
      gained: [
        { query: 'windshield replacement near me', clicks: 64, before: 47, impressions: 2410, position: 6.8 },
        { query: 'mobile windshield replacement', clicks: 18, before: 9, impressions: 690, position: 7.3 },
        { query: 'rock chip repair near me', clicks: 22, before: 15, impressions: 760, position: 5.9 },
      ],
      lost: [
        { query: 'car window replacement', clicks: 14, before: 19, impressions: 1120, position: 11.6 },
      ],
      fresh: [
        { query: 'adas calibration after windshield replacement', clicks: 2, impressions: 210, position: 14.1 },
        { query: 'does insurance cover windshield replacement', clicks: 1, impressions: 330, position: 18.6 },
      ],
    },
    namedQueries: 187,
    namedClicks: Math.round(clicks * 0.2) + Math.round(clicks * 0.62),
  }

  return { siteUrl: SITE.replace(/^https:\/\//, ''), traffic, search }
}
