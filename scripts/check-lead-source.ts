/**
 * What a lead alert says about where the lead came from.
 *
 *   npx tsx scripts/check-lead-source.ts
 *
 * Two rules share one badge slot on the alert and must never both fire:
 * `adSourceOf` makes a claim about MONEY SPENT, and `taggedSourceOf` reports
 * the shop's own link tagging. Getting that boundary wrong is not cosmetic —
 * telling a shop their Business Profile lead came from Google Ads is exactly
 * the mistake that makes them distrust the ad reporting they pay for.
 *
 * The tagged cases below are the real link list from a live client, who runs
 * a separate tagged link for each Business Profile, Yelp, the social accounts
 * and a couple of directories.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */
import { adSourceOf, taggedSourceOf, type LeadAttribution } from '@/lib/lead-notifications'

let bad = 0

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got      ${actual}\n       expected ${expected}`}`)
}

/** How the badge would read, in one string, so a case is a line. */
function badge(attribution: LeadAttribution): string {
  const ad = adSourceOf(attribution)
  if (ad) return `PAID ${ad.network}${ad.campaign ? ` · ${ad.campaign}` : ''}`
  const tag = taggedSourceOf(attribution)
  if (tag) return `TAG ${tag.label}${tag.detail ? ` · ${tag.detail}` : ''}`
  return 'NONE'
}

// --- paid stays paid, and never doubles up as a tagged source -------------
check(
  'a gclid is proof, campaign named',
  badge({ gclid: 'EAIaIQ', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'AGMP Lead Gen' }),
  'PAID Google Ads · AGMP Lead Gen'
)
check('a gbraid with no UTMs at all', badge({ gbraid: '0AAAA' }), 'PAID Google Ads')
check(
  'utm-only paid Google, no click id',
  badge({ utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'Brand' }),
  'PAID Google Ads · Brand'
)
check(
  'utm-only paid Microsoft',
  badge({ utmSource: 'bing', utmMedium: 'cpc' }),
  'PAID Microsoft Ads'
)
// The live case this was written for: a Bing Ads lead the admin list called
// Microsoft Ads and the email said nothing about at all.
check('an msclkid alone is proof', badge({ msclkid: 'abc123' }), 'PAID Microsoft Ads')
check('a ttclid alone is proof', badge({ ttclid: 'abc123' }), 'PAID TikTok Ads')
check(
  'msclkid with the campaign tagged',
  badge({ msclkid: 'abc123', utmCampaign: 'Windshield — Bing' }),
  'PAID Microsoft Ads · Windshield — Bing'
)
check('utm_source=adwords is Google Ads, not "Adwords"', badge({ utmSource: 'adwords', utmMedium: 'ppc' }), 'PAID Google Ads')
check(
  'a paid source we cannot name stays off the paid badge',
  badge({ utmMedium: 'cpc' }),
  'TAG cpc'
)
check(
  'a paid source that is not a search engine still reads as a sentence',
  badge({ utmSource: 'facebook', utmMedium: 'paid_social' }),
  'PAID Facebook Ads'
)

// --- the client's own tagged links ----------------------------------------
// Verbatim, because "gbp_aliso_viejo" is the string they typed into the link
// and the only form they can match against their own list.
const tagged: Array<[string, LeadAttribution, string]> = [
  ['a Business Profile per city', { utmSource: 'gbp_aliso_viejo' }, 'TAG gbp_aliso_viejo'],
  ['Yelp', { utmSource: 'yelp' }, 'TAG yelp'],
  ['TikTok', { utmSource: 'tiktok' }, 'TAG tiktok'],
  ['a directory', { utmSource: 'homeservicebase.com' }, 'TAG homeservicebase.com'],
  ['an AI answer engine', { utmSource: 'chatgpt.com' }, 'TAG chatgpt.com'],
  [
    'tagged by keyword rather than source',
    { utmKeyword: 'gbp_huntington_beach' },
    'TAG gbp_huntington_beach',
  ],
  [
    'source plus campaign',
    { utmSource: 'facebook', utmCampaign: 'summer_promo' },
    'TAG facebook · summer_promo',
  ],
  [
    'the same fact tagged twice, cased differently',
    { utmSource: 'yelp', utmCampaign: 'Yelp' },
    'TAG yelp',
  ],
  [
    'an unpaid medium is never a paid claim',
    { utmSource: 'instagram', utmMedium: 'social' },
    'TAG instagram',
  ],
  ['campaign only', { utmCampaign: 'spring' }, 'TAG spring'],
  ['medium alone beats silence', { utmMedium: 'referral' }, 'TAG referral'],
  [
    'keyword and content both ride along',
    { utmSource: 'yelp', utmKeyword: 'windshield', utmContent: 'sidebar' },
    'TAG yelp · windshield · sidebar',
  ],
]
for (const [label, attribution, expected] of tagged) check(label, badge(attribution), expected)

// --- silence, which is the default ----------------------------------------
check('nothing tagged, nothing claimed', badge({}), 'NONE')
check('empty strings are not a source', badge({ utmSource: '', utmMedium: '   ' }), 'NONE')
check('undefined attribution', adSourceOf(null) === null && taggedSourceOf(null) === null ? 'NONE' : 'x', 'NONE')

// --- values arrive from a query string, so treat them as hostile ----------
check(
  'a newline cannot forge a field in the plain-text part',
  badge({ utmSource: 'yelp\nPhone: (555) 010-0000' }),
  'TAG yelp Phone: (555) 010-0000'
)
const long = badge({ utmSource: 'x'.repeat(400) })
check('a very long value is capped', String(long.length <= 5 + 48), 'true')

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
