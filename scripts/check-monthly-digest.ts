/**
 * The month's figures, and the email built from them.
 *
 * Run: npx tsx scripts/check-monthly-digest.ts
 *
 * WHY THESE ARE PURE FUNCTIONS. Nothing local can reach Google Ads, so an
 * arithmetic bug in the spend summary would ship unverified — the same reason
 * `compareToStandard()` is separate from its fetch. Rows in, numbers out, and
 * the rows here are shaped exactly as the API returns them, camelCase and all.
 *
 * THE FIGURE THAT MATTERS IS COST PER CONVERSION, and there are two ways to
 * get it wrong, both of which produce a plausible number:
 *
 * - Counting the channels as an ADDITION to the enquiry total. A tracked call
 *   already writes a Lead, so calls are inside the total; adding them halves
 *   the apparent cost per conversion.
 * - Dividing spend by OUR enquiry count instead of Google's conversion count.
 *   Our count includes organic and direct, so it is always larger, so the
 *   cost per conversion always looks better than the shop's Ads account says.
 *   A figure that reconciles against nothing is worse than no figure.
 */

import {
  daysInMonth,
  summariseAds,
  summariseEnquiries,
  type MonthlyDigest,
} from '../src/lib/monthly-digest'
import { renderMonthlyReportEmail } from '../src/lib/monthly-report-email'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

function expectEqual(label: string, got: unknown, want: unknown) {
  if (got === want) pass(`${label}: ${got}`)
  else fail(`${label}\n      got:  ${got}\n      want: ${want}`)
}

// --- Enquiries -------------------------------------------------------------

console.log('\nEnquiries: the channels PARTITION the total, never add to it')
{
  const leads = [
    { source: 'FORM', status: 'SOLD', saleValue: 480 },
    { source: 'FORM', status: 'NEW', saleValue: null },
    { source: 'PHONE', status: 'SOLD', saleValue: 320 },
    { source: 'PHONE', status: 'LOST', saleValue: null },
    { source: 'PHONE', status: 'CONTACTED', saleValue: null },
    { source: 'SMS', status: 'SOLD', saleValue: null },
    { source: 'MANUAL', status: 'NEW', saleValue: null },
  ]
  const e = summariseEnquiries(leads)
  expectEqual('total', e.total, 7)
  const summed =
    e.byChannel.form + e.byChannel.phone + e.byChannel.sms + e.byChannel.other
  if (summed === e.total) pass(`the channels sum to the total (${summed})`)
  else fail(`channels summed to ${summed} but the total is ${e.total} — one lead counted twice`)
  expectEqual('calls', e.byChannel.phone, 3)
  expectEqual('form', e.byChannel.form, 2)
  expectEqual('texts', e.byChannel.sms, 1)
  expectEqual('other', e.byChannel.other, 1)
  expectEqual('booked', e.booked, 3)
  expectEqual('lost', e.lost, 1)
  expectEqual('open', e.open, 3)
  // A booked job with no value typed is a booked job. Revenue is only what
  // they entered, never grossed up.
  expectEqual('revenue', e.revenue, 800)

  const empty = summariseEnquiries([])
  if (empty.total === 0 && empty.revenue === 0) pass('an empty month is zeroes, not nulls')
  else fail('an empty month did not come out as zeroes')
}

// --- Ads -------------------------------------------------------------------

console.log('\nAds: totals are the sum of the campaign rows')
{
  /* SHAPED AS THE API ACTUALLY RETURNS IT. Google Ads answers camelCase over
     REST (`costMicros`), and cost is in MICROS — a summariser that read
     `cost_micros` would report every spend as $0, and a report saying a shop
     spent nothing last month is one they would ring about. Both spellings are
     accepted; this fixture uses the real one. */
  const campaigns = [
    {
      campaign: { id: '1', name: 'Windshield — Orlando', status: 'ENABLED' },
      metrics: { costMicros: '1450000000', clicks: '212', impressions: '8400', conversions: 31.5 },
    },
    {
      campaign: { id: '2', name: 'Chip repair', status: 'ENABLED' },
      metrics: { costMicros: '310000000', clicks: '48', impressions: '1900', conversions: 6 },
    },
    // Paused mid-month, and its spend is still the shop's money.
    {
      campaign: { id: '3', name: 'Old brand campaign', status: 'PAUSED' },
      metrics: { costMicros: '90000000', clicks: '11', impressions: '400', conversions: 0 },
    },
    // Ran nothing. Dropped from the table rather than printed as a row of
    // zeroes for the shop to read past.
    {
      campaign: { id: '4', name: 'Never launched', status: 'ENABLED' },
      metrics: { costMicros: '0', clicks: '0', impressions: '0', conversions: 0 },
    },
  ]
  const keywords = [
    {
      adGroupCriterion: { keyword: { text: 'windshield replacement orlando', matchType: 'PHRASE' } },
      campaign: { name: 'Windshield — Orlando' },
      metrics: { costMicros: '620000000', clicks: '88', conversions: 14 },
    },
    {
      adGroupCriterion: { keyword: { text: 'rock chip repair near me', matchType: 'BROAD' } },
      campaign: { name: 'Chip repair' },
      metrics: { costMicros: '180000000', clicks: '30', conversions: 4 },
    },
    // No spend, no clicks: a keyword the shop has to read past.
    {
      adGroupCriterion: { keyword: { text: 'dormant term', matchType: 'EXACT' } },
      campaign: { name: 'Chip repair' },
      metrics: { costMicros: '0', clicks: '0', conversions: 0 },
    },
  ]

  const ads = summariseAds('1234567890', campaigns, keywords)
  expectEqual('spend, from micros', ads.spend, 1850)
  expectEqual('clicks', ads.clicks, 271)
  expectEqual('impressions', ads.impressions, 10700)
  expectEqual('conversions', ads.conversions, 37.5)
  // 1850 / 37.5
  if (Math.abs((ads.costPerConversion ?? 0) - 49.333333333333336) < 0.0001)
    pass(`cost per conversion: ${ads.costPerConversion?.toFixed(2)}`)
  else fail(`cost per conversion came out ${ads.costPerConversion}`)

  /* A PAUSED CAMPAIGN'S SPEND IS STILL SPEND. Filtering the query by status
     would drop it, and then the campaign rows would not add up to the account
     total — which is the number the shop compares against their card
     statement. */
  if (ads.campaigns.some((c) => c.name === 'Old brand campaign'))
    pass('a campaign paused mid-month keeps its spend')
  else fail('a paused campaign was dropped along with the money it spent')
  if (!ads.campaigns.some((c) => c.name === 'Never launched'))
    pass('a campaign that spent nothing is not a row')
  else fail('a zero-spend campaign was printed for the shop to read past')

  const total = ads.campaigns.reduce((s, c) => s + c.spend, 0)
  if (Math.abs(total - ads.spend) < 0.001) pass('the campaign rows add up to the account total')
  else fail(`campaigns summed to ${total} but the total says ${ads.spend}`)

  expectEqual('keywords kept', ads.keywords.length, 2)
  expectEqual('ordered by spend', ads.keywords[0].text, 'windshield replacement orlando')
  expectEqual('keyword spend, from micros', ads.keywords[0].spend, 620)

  // snake_case is accepted too, because a GAQL response read a different way
  // would silently report every spend as zero.
  const snake = summariseAds(
    '1',
    [
      {
        campaign: { name: 'Snake', status: 'ENABLED' },
        metrics: { cost_micros: '500000000', clicks: '10', impressions: '100', conversions: 2 },
      },
    ],
    []
  )
  expectEqual('snake_case cost still reads', snake.spend, 500)

  // No conversions is null, not a division by zero dressed as Infinity.
  const noConv = summariseAds(
    '1',
    [
      {
        campaign: { name: 'Quiet', status: 'ENABLED' },
        metrics: { costMicros: '200000000', clicks: '5', impressions: '90', conversions: 0 },
      },
    ],
    []
  )
  if (noConv.costPerConversion === null) pass('no conversions gives null, not Infinity')
  else fail(`no conversions gave ${noConv.costPerConversion}`)
}

console.log('\nMonth lengths, for the Ads date range')
{
  expectEqual('Feb 2026', daysInMonth(2026, 2), 28)
  expectEqual('Feb 2028 (leap)', daysInMonth(2028, 2), 29)
  expectEqual('April', daysInMonth(2026, 4), 30)
  expectEqual('December', daysInMonth(2026, 12), 31)
  expectEqual('January', daysInMonth(2026, 1), 31)
}

// --- The email -------------------------------------------------------------

const BASE: MonthlyDigest = {
  clientId: 'c1',
  businessName: 'MAG Mobile Auto Glass',
  year: 2026,
  month: 2,
  label: 'February 2026',
  timezone: 'America/New_York',
  from: '2026-02-01T05:00:00.000Z',
  to: '2026-03-01T05:00:00.000Z',
  enquiries: {
    total: 41,
    byChannel: { form: 18, phone: 21, sms: 2, other: 0 },
    booked: 12,
    lost: 6,
    open: 23,
    revenue: 5400,
  },
  ads: {
    customerId: '1234567890',
    spend: 1850,
    clicks: 271,
    impressions: 10700,
    conversions: 37.5,
    costPerConversion: 49.33,
    campaigns: [
      {
        name: 'Windshield — Orlando',
        status: 'ENABLED',
        spend: 1450,
        clicks: 212,
        impressions: 8400,
        conversions: 31.5,
        costPerConversion: 46.03,
      },
    ],
    keywords: [
      {
        text: 'windshield replacement orlando',
        matchType: 'PHRASE',
        campaign: 'Windshield — Orlando',
        spend: 620,
        clicks: 88,
        conversions: 14,
      },
    ],
  },
  work: [
    { at: '2026-02-04T12:00:00.000Z', kind: 'website', title: 'Wrote the Winter Park city page' },
    { at: '2026-02-19T12:00:00.000Z', kind: 'ranking', title: 'Ran the local ranking scan' },
  ],
  nextSteps: [
    { title: 'Two campaigns are budget-capped', detail: 'Both hit their daily cap 14 days of 28.', severity: 'REVIEW' },
  ],
  note: null,
}

console.log('\nThe email')
{
  const { subject, html, text } = renderMonthlyReportEmail(BASE, 'Adding two more city pages.')
  expectEqual('subject', subject, 'MAG Mobile Auto Glass — February 2026 report')

  for (const needle of ['February 2026', '$1,850', '41', '$49.33', 'Winter Park', 'Adding two more city pages.']) {
    if (html.includes(needle)) pass(`html carries ${needle}`)
    else fail(`html is missing ${needle}`)
  }
  /* THE SENTENCE THAT KEEPS THE TWO NUMBERS FROM READING AS A MISTAKE. 41
     enquiries and 37.5 conversions sit inches apart, and a shop who notices
     without being told concludes one of them is invented. */
  if (/Google&rsquo;s own figures|Google’s own figures/.test(html))
    pass('and says whose conversion figure it is')
  else fail('nothing on the page explains why the two counts differ')

  // The text part is not an afterthought: it is what a plain-text client and
  // most spam filters read.
  for (const needle of ['ENQUIRIES', 'GOOGLE ADS', 'WHAT WE DID', "WHAT'S NEXT"]) {
    if (text.includes(needle)) pass(`text carries ${needle}`)
    else fail(`text is missing ${needle}`)
  }

  // A booked count of zero must read as missing data, not as failure.
  const unmarked = renderMonthlyReportEmail(
    { ...BASE, enquiries: { ...BASE.enquiries, booked: 0, revenue: 0, open: 35 } },
    null
  )
  if (/None of these are marked booked/.test(unmarked.html))
    pass('zero booked says which it is')
  else fail('a zero booked count was left to argue against the service on its own')

  // A self-serve client: no ads account, no ads block, and no apology for it.
  const selfServe = renderMonthlyReportEmail({ ...BASE, ads: null }, null)
  if (!/Google Ads/.test(selfServe.html)) pass('no ads account, no ads section')
  else fail('an ads section rendered for a client with no ads account')
  if (/Enquiries|enquiries/.test(selfServe.html)) pass('and the rest of the report still stands')
  else fail('dropping the ads block took the report with it')

  /* A FAILURE IS NOT AN ABSENCE — the mistake place-location.ts records. An
     ads block silently missing during an outage reads as "we spent nothing on
     your ads last month". */
  const broken = renderMonthlyReportEmail(
    { ...BASE, ads: null, adsError: 'invalid_grant' },
    null
  )
  if (/could not read your Ads account/.test(broken.html))
    pass('an API failure says so rather than showing nothing')
  else fail('an ads failure was indistinguishable from a client with no ads')
  if (!/invalid_grant/.test(broken.html))
    pass("and does not put Google's error text in front of the shop")
  else fail('a raw API error leaked into the client-facing email')

  // An empty month is a real month.
  const quiet = renderMonthlyReportEmail(
    {
      ...BASE,
      enquiries: { total: 0, byChannel: { form: 0, phone: 0, sms: 0, other: 0 }, booked: 0, lost: 0, open: 0, revenue: 0 },
      ads: null,
      work: [],
      nextSteps: [],
    },
    null
  )
  if (/No enquiries came in last month/.test(quiet.html)) pass('a quiet month says so plainly')
  else fail('an empty month rendered as blank space')

  // The note is escaped, because it is typed into a textarea and lands in HTML.
  const nasty = renderMonthlyReportEmail(BASE, 'Call <script>alert(1)</script> them')
  if (!nasty.html.includes('<script>')) pass('the note is escaped on the way into the email')
  else fail('the operator note was interpolated into HTML unescaped')
}

console.log(
  failures === 0
    ? '\nAll monthly-digest checks passed.'
    : `\n${failures} monthly-digest check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
