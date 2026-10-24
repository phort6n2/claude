/**
 * "Bad lead": the trace and the safety checks, on REAL Google Ads rows.
 *
 *   npx tsx scripts/check-bad-lead.ts
 *
 * The rows are AGS's and Collision's for 2026-10-22, read live (read-only) and
 * written here in the REST API's camelCase. Nothing in this script can write
 * to Google: the search function is answered from these rows and there is no
 * mutate anywhere in it. Silent cases first — a negative added that blocks a
 * customer costs jobs for months with nothing going red.
 */
import { traceLead } from '../src/lib/bad-lead-trace'
import {
  costMatch,
  fallbackProposals,
  hourCampaigns,
  negativeProblems,
  readProposals,
  reasonsFor,
  type ShopFacts,
} from '../src/lib/bad-lead'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

type Rows = Record<string, unknown>[]
const ok = (rows: Rows) => ({ ok: true as const, rows })

/* ------------------------------------------------------------- AGS, BC */
const AGS_CALLS: Rows = [
  { campaign: { id: '24271482398', name: 'AGMP Lead Gen', advertisingChannelType: 'SEARCH' }, adGroup: { id: '202840776360', name: 'Side Window Replacement' }, callView: { callerAreaCode: '604', callDurationSeconds: '38', startCallDateTime: '2026-10-22 12:08:41' } },
  { campaign: { id: '24271482398', name: 'AGMP Lead Gen', advertisingChannelType: 'SEARCH' }, adGroup: { id: '202840776360', name: 'Side Window Replacement' }, callView: { callerAreaCode: '604', callDurationSeconds: '25', startCallDateTime: '2026-10-22 13:03:05' } },
]
const AGS_TERMS: Rows = [
  { searchTermView: { searchTerm: 'apollo auto' }, segments: { keyword: { info: { text: 'car window replacement', matchType: 'BROAD' } } }, metrics: { clicks: '1', costMicros: '13080000' } },
  { searchTermView: { searchTerm: 'west can near me' }, segments: { keyword: { info: { text: 'car window replacement', matchType: 'BROAD' } } }, metrics: { clicks: '1', costMicros: '7760000' } },
]
const AGS_HOURS: Rows = [7, 12, 13, 17].map((h) => ({
  segments: { hour: h },
  metrics: { clicks: '1', costMicros: { 7: '8130000', 12: '7760000', 13: '13080000', 17: '9150000' }[h] },
}))

async function agsSearch(_cid: string, q: string) {
  if (/FROM customer\b/.test(q)) return ok([{ customer: { timeZone: 'America/Vancouver' } }])
  if (/FROM call_view/.test(q)) return ok(AGS_CALLS)
  if (/FROM search_term_view/.test(q)) return ok(AGS_TERMS)
  if (/FROM ad_group\b/.test(q) && /segments\.hour/.test(q)) return ok(AGS_HOURS)
  if (/FROM campaign\b/.test(q) && /phone_calls/.test(q)) return ok([])
  return ok([])
}

/* ------------------------------------------------------- Collision, OR */
const COL_CALLS: Rows = [
  ['11:36:33', '816', '182177504134', 'Auto Glass Replacement'],
  ['11:43:55', '757', '186315874511', 'Windshield Repair'],
  ['11:52:13', '541', '182803941305', 'Windshield Replacement'],
  ['15:29:26', '503', '183515071436', 'Collision Auto Glass'],
].map(([t, ac, ag, agn]) => ({
  campaign: { id: '22863074045', name: 'AGMP Lead Gen', advertisingChannelType: 'SEARCH' },
  adGroup: { id: ag, name: agn },
  callView: { callerAreaCode: ac, callDurationSeconds: '60', startCallDateTime: `2026-10-22 ${t}` },
}))
const PMAX = { id: '22870652597', name: 'AGMP PMAX', advertisingChannelType: 'PERFORMANCE_MAX' }
const LEADGEN = { id: '22863074045', name: 'AGMP Lead Gen', advertisingChannelType: 'SEARCH' }
const COL_HOURLY: Rows = [
  [PMAX, 8, 1], [PMAX, 9, 1], [LEADGEN, 11, 3], [PMAX, 12, 1], [PMAX, 13, 1],
  [PMAX, 14, 3], [LEADGEN, 15, 1], [PMAX, 15, 4], [PMAX, 16, 3],
].map(([c, h, n]) => ({ campaign: c, segments: { hour: h }, metrics: { phoneCalls: String(n) } }))
const PMAX_TERMS: Array<[string, number]> = [
  ['a2 glass', 5750565], ['aaa oregon', 25315446], ['adas calibration cost', 2562333], ['arthur automotive', 9750000],
  ['auto glass shop repair near me', 10210000], ['columbia river auto glass', 21639552], ['glass repair portland', 27459230],
  ['hawthorne auto clinic', 21680158], ['mannings automotive', 6740000], ['pdx british', 12020607], ['pronto auto glass', 3540000],
  ['protek automotive', 4965000], ['repair windshield near me', 13554180], ['tabor volvo', 6005000], ['west hills collision', 9520000],
  ['windshield crack repair', 26513996], ['windshield repair', 6390000], ['windshield repairs near me', 15520000],
]
const PMAX_HOURS: Rows = [[14, 38, 65798183], [15, 49, 99085418], [16, 23, 60842473]].map(([h, c, m]) => ({
  segments: { hour: h },
  metrics: { clicks: String(c), costMicros: String(m) },
}))

async function collisionSearch(_cid: string, q: string) {
  if (/FROM customer\b/.test(q)) return ok([{ customer: { timeZone: 'America/Los_Angeles' } }])
  if (/FROM call_view/.test(q)) return ok(COL_CALLS)
  if (/FROM campaign\b/.test(q) && /phone_calls/.test(q)) return ok(COL_HOURLY)
  if (/FROM campaign_search_term_view/.test(q)) return ok(PMAX_TERMS.map(([t, m]) => ({ campaignSearchTermView: { searchTerm: t }, metrics: { clicks: '1', costMicros: String(m) } })))
  if (/FROM campaign\b/.test(q) && /segments\.hour/.test(q)) return ok(PMAX_HOURS)
  if (/FROM search_term_view/.test(q)) return ok([{ searchTermView: { searchTerm: 'collision auto glass portland' }, segments: { keyword: { info: { text: 'collision auto glass', matchType: 'PHRASE' } } }, metrics: { clicks: '1', costMicros: '9400000' } }])
  if (/FROM ad_group\b/.test(q) && /segments\.hour/.test(q)) return ok([{ segments: { hour: 15 }, metrics: { clicks: '1', costMicros: '9400000' } }])
  return ok([])
}

const lead = (over: Partial<Parameters<typeof traceLead>[0]['lead']>) => ({
  id: 'L1',
  createdAt: new Date(),
  source: 'PHONE',
  phone: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  trafficSource: null,
  trafficMedium: null,
  firstSeenAt: null,
  utmCampaign: null,
  utmContent: null,
  campaignId: null,
  adGroupId: null,
  ...over,
})

const COLLISION: ShopFacts = {
  businessName: 'Collision Auto Glass & Calibration',
  brandTerms: ['collision auto glass & calibration', 'collision'],
  city: 'Portland',
  state: 'OR',
  marketArea: 'Portland Metro',
  serviceAreas: ['Portland', 'Beaverton', 'Gresham', 'Hillsboro', 'Tigard', 'Vancouver'],
  offersWindshieldRepair: true,
  offersRockChipRepair: true,
  offersSunroofRepair: false,
  offersAdasCalibration: true,
  offersMobileService: true,
}
const AGS: ShopFacts = {
  businessName: 'AGS Affordable Glass Services Ltd.',
  brandTerms: ['ags affordable glass services ltd.', 'affordable'],
  city: 'Vancouver',
  state: 'BC',
  marketArea: null,
  serviceAreas: ['Vancouver', 'Burnaby', 'Surrey', 'West Vancouver'],
  offersWindshieldRepair: false,
  offersRockChipRepair: false,
  offersSunroofRepair: false,
  offersAdasCalibration: false,
  offersMobileService: false,
}

async function main() {
  console.log('\nThe trace — real rows, 2026-10-22')
  {
    // AGS: the 12:08 call reached our tracking number two seconds after Google logged it.
    const t = await traceLead({
      lead: lead({ phone: '+16045550142', createdAt: new Date('2026-10-22T19:08:43Z') }),
      customerId: '6109211627',
      fallbackZone: 'America/Vancouver',
      reason: 'other',
      search: agsSearch,
    })
    check(t.confidence === 'call', 'AGS 12:08 call: matched in Google’s call log')
    check(t.campaign?.name === 'AGMP Lead Gen' && t.adGroup?.name === 'Side Window Replacement', '…to AGMP Lead Gen › Side Window Replacement')
    const best = t.candidates.find((c) => c.bestMatch)
    check(best?.term === 'west can near me' && best.costMicros === 7_760_000, '…best match "west can near me" ($7.76): the hour’s only click cost the same')
    check(t.candidates[0].term === 'west can near me', '…and it is listed first')
  }
  {
    // AGS, a call 20 minutes from anything in the log, and no ad calls that hour: not traced.
    const t = await traceLead({
      lead: lead({ phone: '+16045550142', createdAt: new Date('2026-10-22T22:30:00Z') }),
      customerId: '6109211627',
      fallbackZone: 'America/Vancouver',
      reason: 'other',
      search: agsSearch,
    })
    check(t.confidence === 'none' && t.candidates.length === 0, 'a call nothing in Google accounts for is NOT traced, and suggests nothing')
  }
  {
    // Collision, 2:40pm: nothing in the log near it; PMax took 3 ad calls that hour.
    const t = await traceLead({
      lead: lead({ phone: '+15035550190', createdAt: new Date('2026-10-22T21:40:00Z') }),
      customerId: '8934801428',
      fallbackZone: 'America/Los_Angeles',
      reason: 'insurance',
      search: collisionSearch,
    })
    check(t.confidence === 'hour' && t.campaign?.name === 'AGMP PMAX', 'Collision 2:40pm call: traced to AGMP PMAX by hour')
    const terms = t.candidates.map((c) => c.term)
    check(terms.includes('aaa oregon') && terms.includes('hawthorne auto clinic'), '…candidates include "aaa oregon" and "hawthorne auto clinic"')
    check(terms[0] === 'aaa oregon', '…and for "Insurance or AAA", "aaa oregon" is ranked first')
    check(!t.candidates.some((c) => c.bestMatch), '…with no best match: 38 clicks that hour, so cost cannot single one out')
  }
  {
    // Collision, 3:10pm: the 15:00 hour has Lead Gen 1 and PMax 4 — Lead Gen's is the 15:29 call in the log.
    const t = await traceLead({
      lead: lead({ phone: '+15035550191', createdAt: new Date('2026-10-22T22:10:00Z') }),
      customerId: '8934801428',
      fallbackZone: 'America/Los_Angeles',
      reason: 'mechanic',
      search: collisionSearch,
    })
    check(t.campaign?.name === 'AGMP PMAX', '3:10pm call: PMax, because Lead Gen’s one 3pm call is the 15:29 one in the log')
    check(t.candidates.slice(0, 6).every((c) => c.reasonHits > 0), '…and for "Mechanic" the mechanic-looking searches lead')
  }
  {
    // Collision, 3:29:40pm from a 503 number: Google's 15:29:26 call.
    const t = await traceLead({
      lead: lead({ phone: '+15035550192', createdAt: new Date('2026-10-22T22:29:40Z') }),
      customerId: '8934801428',
      fallbackZone: 'America/Los_Angeles',
      reason: 'other',
      search: collisionSearch,
    })
    check(t.confidence === 'call' && t.adGroup?.name === 'Collision Auto Glass', '3:29pm 503 call: matched to AGMP Lead Gen › Collision Auto Glass in the call log')
  }
  {
    // A form lead from organic search: never traced to an ad.
    const t = await traceLead({
      lead: lead({ source: 'FORM', trafficSource: 'google', trafficMedium: 'organic', createdAt: new Date('2026-10-22T21:40:00Z') }),
      customerId: '8934801428',
      fallbackZone: 'America/Los_Angeles',
      reason: 'insurance',
      search: collisionSearch,
    })
    check(t.confidence === 'none', 'an organic form lead is not traced to an ad')
  }

  console.log('\nThe hour rule')
  {
    const rows = [
      { campaignId: 'L', campaignName: 'Lead Gen', channel: 'SEARCH', hour: 15, phoneCalls: 1 },
      { campaignId: 'P', campaignName: 'PMax', channel: 'PERFORMANCE_MAX', hour: 15, phoneCalls: 4 },
    ]
    check(hourCampaigns(rows, 15, [{ campaignId: 'L', hour: 15 }]).map((r) => r.campaignId).join() === 'P', 'a logged call is subtracted from its campaign first')
    check(hourCampaigns(rows, 14, []).length === 0, 'an hour with no ad calls traces nothing')
    check(costMatch([{ term: 'a', clicks: 1, costMicros: 7_760_000 }, { term: 'b', clicks: 1, costMicros: 13_080_000 }], 1, 7_760_000) === 'a', 'one click, one cost: that term')
    check(costMatch([{ term: 'a', clicks: 1, costMicros: 7_760_000 }], 2, 7_760_000) === null, 'two clicks in the hour: no best match')
    check(costMatch([{ term: 'a', clicks: 1, costMicros: 5_000_000 }, { term: 'b', clicks: 1, costMicros: 5_000_000 }], 1, 5_000_000) === null, 'two terms at the same cost: no best match, not a guess')
  }

  console.log('\nSafety — what must NOT be added on its own')
  const col: Parameters<typeof negativeProblems>[1] = { shop: COLLISION, searchTerms: PMAX_TERMS.map(([t]) => t), positives: [], existing: [] }
  const kinds = (text: string, matchType: 'PHRASE' | 'EXACT' | 'BROAD' = 'PHRASE', ctx = col) => negativeProblems({ text, matchType }, ctx).map((p) => p.kind)
  check(kinds('west hills collision').includes('brand'), '"west hills collision" carries "collision", the shop’s name → review')
  check(kinds('collision').includes('brand'), '"collision" for Collision Auto Glass → review')
  check(kinds('a2 glass').includes('glass-term'), 'a competitor GLASS shop ("a2 glass") → review, not junk')
  check(kinds('windshield repair').includes('glass-term'), '"windshield repair" → review')
  check(kinds('repair windshield near me').includes('service-only'), 'every word a service word → review')
  check(kinds('aaa').includes('insurer'), 'phrase "aaa" alone also blocks "aaa windshield claim" → review')
  check(kinds('aaa roadside').includes('not-from-search'), 'a phrase not in any reported search ("aaa roadside") → the model may not invent it')
  check(kinds('portland').length > 0, 'a service-area city alone → review')
  check(kinds('oil', 'PHRASE', { ...col, searchTerms: ['oil change portland'] }).includes('single-word'), 'any one-word phrase negative → review')
  check(kinds('pdx british', 'BROAD').includes('broad'), 'broad match → review')
  {
    const ags = { shop: AGS, searchTerms: ['ags glass', 'icbc glass claim', 'west can near me'], positives: [], existing: [] }
    check(kinds('ags', 'EXACT', ags).includes('brand'), '"ags" for AGS → review (three letters: the brand floor is 3, not 4)')
    check(kinds('icbc glass claim', 'PHRASE', ags).includes('insurer'), 'ICBC for a BC shop is every customer’s insurer → review')
    check(reasonsFor(AGS).some((r) => r.key === 'chip') && !reasonsFor(COLLISION).some((r) => r.key === 'chip'), '"Chip repair" is a reason only for a shop that does not do chips')
    // A shop marks only callers who wanted something OTHER than auto glass.
    const shopSees = reasonsFor(COLLISION, 'client')
    check(!shopSees.some((r) => r.key === 'out-of-area') && reasonsFor(COLLISION).some((r) => r.key === 'out-of-area'), 'a shop is not offered "Outside service area" — an auto glass customer in the wrong place is a targeting question; the owner still has it')
    check(shopSees.find((r) => r.key === 'other')?.label === 'Something else (not auto glass)', 'a shop’s "Other" says "not auto glass"')
  }
  {
    const withKw = { ...col, searchTerms: ['back glass replacement cost'], positives: [{ text: 'back glass replacement', matchType: 'PHRASE', adGroupName: 'Back Glass' }] }
    check(kinds('glass replacement', 'PHRASE', withKw).includes('blocks-keyword'), 'a phrase inside a keyword the campaign buys → review, naming the keyword')
  }
  {
    // The phrase "aaa" Matt put on AGMP PMAX on 10-23 already covers "aaa oregon".
    const withNeg = { ...col, existing: [{ text: 'aaa', matchType: 'PHRASE', where: 'this campaign' }] }
    const p = negativeProblems({ text: 'aaa oregon', matchType: 'PHRASE' }, withNeg)
    check(p.length === 1 && p[0].kind === 'duplicate' && !!p[0].blocking, '"aaa oregon" when phrase "aaa" is already there → already excluded, not added twice')
  }

  console.log('\nSafety — what MAY be added on its own')
  check(kinds('aaa oregon').length === 0, 'phrase "aaa oregon" passes')
  check(kinds('hawthorne auto clinic').length === 0, 'phrase "hawthorne auto clinic" passes')
  check(kinds('arthur automotive').length === 0, 'phrase "arthur automotive" passes')
  check(kinds('aaa', 'EXACT', { ...col, searchTerms: ['aaa'] }).length === 0, 'EXACT [aaa] blocks only that search — passes')
  {
    const ags = { shop: AGS, searchTerms: AGS_TERMS.map((r) => String((r.searchTermView as { searchTerm: string }).searchTerm)), positives: [{ text: 'car window replacement', matchType: 'BROAD' }], existing: [] }
    check(kinds('west can near me', 'PHRASE', ags).length === 0, 'AGS: phrase "west can near me" passes')
    check(kinds('west can', 'PHRASE', ags).length === 0, 'AGS: the shorter "west can" passes too')
  }

  console.log('\nReading the model')
  {
    const p = readProposals({ negatives: [{ text: '  AAA Oregon ', match_type: 'phrase' }, { text: 'aaa oregon', match_type: 'PHRASE' }, { text: '' }, 'junk', { text: 'x'.repeat(200) }] })
    check(p.length === 1 && p[0].text === 'aaa oregon' && p[0].matchType === 'PHRASE', 'normalised, deduped, junk dropped — not repaired')
    check(readProposals('nonsense').length === 0 && readProposals(null).length === 0, 'anything malformed is no proposals')
    const fb = fallbackProposals(
      [
        { term: 'west can near me', clicks: 1, costMicros: 7_760_000, campaignId: 'c', campaignName: 'AGMP', adGroupId: null, adGroupName: null, keyword: null, keywordMatchType: null, bestMatch: true, reasonHits: 0 },
        { term: 'apollo auto', clicks: 1, costMicros: 13_080_000, campaignId: 'c', campaignName: 'AGMP', adGroupId: null, adGroupName: null, keyword: null, keywordMatchType: null, bestMatch: false, reasonHits: 0 },
      ],
      'other'
    )
    check(fb.length === 1 && fb[0].matchType === 'EXACT' && fb[0].text === 'west can near me', 'without the model: the best match only, as EXACT')
  }

  console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
  process.exit(failures ? 1 : 0)
}
main()
