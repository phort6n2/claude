import { PUBLIC_INSURERS } from '@/lib/insurance-rules'

/**
 * "BAD LEAD" — the rules, import-free so they are checked against real Google
 * rows without credentials (`scripts/check-bad-lead.ts`).
 *
 * A shop marks a lead as junk (AAA, an insurer, a mechanic, tint, a chip on a
 * replacement-only shop). The app traces it to the search that bought it
 * (`bad-lead-trace.ts`), the model picks the negative keywords
 * (`bad-lead-ai.ts`), and THIS FILE decides whether each one may be added
 * without a person looking at it. The owner asked for the negatives to be
 * written for him; the price of that is that every rule here is deterministic
 * and leans towards sending a term to the review queue, because a negative
 * that blocks a real customer costs jobs silently, for months, and nothing in
 * Google Ads goes red for it.
 *
 * THE LINE: a negative is added on its own only when it is built from a real
 * search Google reports (the model cannot invent a word), it names nothing the
 * shop sells, it is not the shop's name or a place it serves, and it blocks no
 * keyword the campaign is buying. Everything else goes to the queue with the
 * reason, one click from being added.
 */

/* ------------------------------------------------------------------ reasons */

export interface BadLeadReason {
  key: string
  label: string
  /** Words that, in a search term, point at this kind of junk — used to rank candidates. */
  hints: string[]
}

export const BAD_LEAD_REASONS: BadLeadReason[] = [
  {
    key: 'mechanic',
    label: 'Mechanic / auto repair',
    hints: [
      'automotive', 'mechanic', 'mechanics', 'auto repair', 'car repair', 'auto clinic', 'auto service', 'auto shop',
      'garage', 'motors', 'tire', 'tires', 'brake', 'brakes', 'oil change', 'transmission', 'engine', 'muffler',
      'alignment', 'smog', 'diagnostic', 'dealership', 'dealer', 'volvo', 'toyota', 'honda', 'subaru', 'ford',
      'chevy', 'chevrolet', 'nissan', 'bmw', 'audi', 'mercedes', 'lexus', 'jeep', 'hyundai', 'kia', 'mazda',
      'british', 'european', 'import', 'imports',
    ],
  },
  {
    key: 'insurance',
    label: 'Insurance or AAA',
    hints: [
      'aaa', 'insurance', 'insurer', 'geico', 'state farm', 'progressive', 'allstate', 'farmers', 'usaa',
      'nationwide', 'liberty mutual', 'travelers', 'esurance', 'safeco', 'roadside', 'claim', 'claims', 'agent',
    ],
  },
  {
    key: 'body-shop',
    label: 'Body shop / collision repair',
    hints: ['collision', 'body shop', 'auto body', 'bodywork', 'body work', 'dent', 'paint', 'bumper', 'frame', 'caliber', 'maaco', 'gerber'],
  },
  { key: 'tint', label: 'Tint', hints: ['tint', 'tinting', 'tints', 'window film', 'ceramic', 'ppf', 'wrap', 'xpel', '3m', 'llumar'] },
  {
    key: 'chip',
    label: "Chip repair (we don't do it)",
    hints: ['chip', 'chips', 'rock chip', 'crack', 'cracks', 'resin', 'ding', 'star break'],
  },
  {
    key: 'wrong-service',
    label: 'Wrong service',
    hints: [
      'home', 'house', 'residential', 'storefront', 'shower', 'mirror', 'glazier', 'glass door', 'sliding door',
      'patio', 'table top', 'tabletop', 'boat', 'rv', 'motorcycle', 'headlight', 'wiper', 'wipers', 'mirror glass',
      'diy', 'kit', 'how to', 'jobs', 'job', 'hiring', 'salary', 'junkyard', 'salvage', 'pick n pull',
    ],
  },
  { key: 'out-of-area', label: 'Outside service area', hints: [] },
  { key: 'spam', label: 'Spam / robocall', hints: [] },
  { key: 'other', label: 'Other', hints: [] },
]

export const REASON_KEYS = BAD_LEAD_REASONS.map((r) => r.key)

export function reasonLabel(key: string): string {
  return BAD_LEAD_REASONS.find((r) => r.key === key)?.label || key
}

export interface ShopFacts {
  businessName: string
  /** The client's brand terms (`brandTermsFor`), phrases or words. */
  brandTerms: string[]
  city: string | null
  state: string | null
  marketArea: string | null
  serviceAreas: string[]
  offersWindshieldRepair: boolean
  offersRockChipRepair: boolean
  offersSunroofRepair: boolean
  offersAdasCalibration: boolean
  offersMobileService: boolean
}

/**
 * NOT FOR "THEY DIDN'T BOOK". A shop's version of the button is only for a
 * caller who wanted something OTHER than auto glass. A price shopper, a
 * no-show, somebody who went with another shop — every one of them wanted
 * auto glass, came from exactly the search the ads should buy, and a
 * negative built from their search stops the ads reaching the next customer
 * like them. So the shop is not offered "Outside service area" (an auto glass
 * customer in the wrong place is a targeting question, for the owner), its
 * "Other" says "not auto glass", and the panel says all of this in words.
 */
export const CLIENT_HIDDEN_REASONS = new Set(['out-of-area'])

const CLIENT_LABELS: Record<string, string> = {
  other: 'Something else (not auto glass)',
}

/** The reasons offered for this shop. "Chip repair" only when it really is the wrong service here. */
export function reasonsFor(
  shop: Pick<ShopFacts, 'offersWindshieldRepair' | 'offersRockChipRepair'>,
  audience: 'admin' | 'client' = 'admin'
): BadLeadReason[] {
  // Chip repair and windshield repair are the same resin job (story-sections.ts).
  const doesChips = shop.offersRockChipRepair || shop.offersWindshieldRepair
  return BAD_LEAD_REASONS.filter((r) => r.key !== 'chip' || !doesChips)
    .filter((r) => audience === 'admin' || !CLIENT_HIDDEN_REASONS.has(r.key))
    .map((r) => (audience === 'client' && CLIENT_LABELS[r.key] ? { ...r, label: CLIENT_LABELS[r.key] } : r))
}

/* ------------------------------------------------------------- confidence */

/**
 * How the lead was tied to an ad, strongest first.
 * - gclid: Google's own click record for this lead's click id.
 * - call:  Google's call log has this call (same area code, start within 3 minutes).
 * - utm:   the landing URL named the campaign and ad group.
 * - hour:  an AGMP campaign took ad calls in that hour and nothing else did — PMax calls never reach the call log.
 * - day:   only the day's searches; the lead itself could not be placed.
 * - none:  not traced to a Google Ads click at all.
 */
export type Confidence = 'gclid' | 'call' | 'utm' | 'hour' | 'day' | 'none'

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  gclid: 'Exact (Google click id)',
  call: 'Call matched in Google’s call log',
  utm: 'Campaign from the landing URL',
  hour: 'Hour match',
  day: 'Same day only',
  none: 'Not traced',
}

export const UNTRACED_NOTE =
  'Couldn’t trace this lead to a Google Ads click: possibly organic, the Business Profile, Local Services or a direct call.'

/* ------------------------------------------------------------- candidates */

export interface Candidate {
  term: string
  clicks: number
  costMicros: number
  campaignId: string
  campaignName: string
  /** Search campaigns only; PMax search terms are per campaign. */
  adGroupId: string | null
  adGroupName: string | null
  /** The keyword the search matched, when Google says (Search only). */
  keyword: string | null
  keywordMatchType: string | null
  /** The click this lead came from, as near as can be proved. */
  bestMatch: boolean
  /** Why it is the best match, in words. */
  bestWhy?: string
  /** How many of the reason's hints the term carries. */
  reasonHits: number
}

export function tokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Does `needle` appear in `hay` as consecutive whole words? */
export function containsPhrase(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

export function reasonHits(term: string, reason: string): number {
  const r = BAD_LEAD_REASONS.find((x) => x.key === reason)
  if (!r) return 0
  const t = tokens(term)
  return r.hints.filter((h) => containsPhrase(t, tokens(h))).length
}

/**
 * The one click that hour, when there was exactly one: its cost IS a search
 * term's cost. Google gives search terms per DAY only — `search_term_view` and
 * `campaign_search_term_view` refuse `segments.hour` (checked live) — so this
 * is the only way to single out a term. AGS 2026-10-22: one click in the 12:00
 * hour at $7.76, and "west can near me" cost $7.76 that day.
 */
export function costMatch(
  candidates: Array<Pick<Candidate, 'term' | 'clicks' | 'costMicros'>>,
  hourClicks: number,
  hourCostMicros: number
): string | null {
  if (hourClicks !== 1 || hourCostMicros <= 0) return null
  const hits = candidates.filter((c) => c.clicks >= 1 && Math.abs(c.costMicros - hourCostMicros) < 10_000)
  return hits.length === 1 ? hits[0].term : null
}

/** Best match first, then the terms that look like this reason, then clicks and cost. */
export function rankCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort(
    (a, b) =>
      Number(b.bestMatch) - Number(a.bestMatch) ||
      b.reasonHits - a.reasonHits ||
      b.clicks - a.clicks ||
      b.costMicros - a.costMicros ||
      a.term.localeCompare(b.term)
  )
}

export const MAX_CANDIDATES = 10

/* ------------------------------------------------------------ hour match */

export interface HourRow {
  campaignId: string
  campaignName: string
  channel: string
  hour: number
  phoneCalls: number
}

/**
 * Which AGMP campaign took the ad call in this hour, for a call Google's call
 * log does not have. Calls the log DOES have are subtracted from their
 * campaign's count first: Collision's 15:00 hour shows Lead Gen 1 and PMax 4,
 * and Lead Gen's one is the 15:29 call in the log, so a call that is not that
 * one belongs to PMax. A tie is returned as several, not guessed.
 */
export function hourCampaigns(
  rows: HourRow[],
  hour: number,
  loggedCalls: Array<{ campaignId: string; hour: number }>
): Array<{ campaignId: string; campaignName: string; channel: string; residual: number }> {
  const out: Array<{ campaignId: string; campaignName: string; channel: string; residual: number }> = []
  for (const r of rows) {
    if (r.hour !== hour || r.phoneCalls <= 0) continue
    const logged = loggedCalls.filter((c) => c.campaignId === r.campaignId && c.hour === hour).length
    const residual = r.phoneCalls - logged
    if (residual > 0) out.push({ campaignId: r.campaignId, campaignName: r.campaignName, channel: r.channel, residual })
  }
  return out.sort((a, b) => b.residual - a.residual)
}

/* --------------------------------------------------------------- safety */

export type MatchType = 'PHRASE' | 'EXACT' | 'BROAD'

export interface NegativeProposal {
  text: string
  matchType: MatchType
  /** The search term it was built from. */
  fromTerm?: string | null
  why?: string
}

export interface ExistingNegative {
  text: string
  matchType: string
  /** campaign | ad_group | list name — for the message. */
  where: string
}

export interface PositiveKeyword {
  text: string
  matchType: string
  adGroupName?: string | null
}

export type ProblemKind =
  | 'brand'
  | 'glass-term'
  | 'service-only'
  | 'place'
  | 'insurer'
  | 'single-word'
  | 'blocks-keyword'
  | 'not-from-search'
  | 'too-short'
  | 'broad'
  | 'duplicate'
  | 'unreadable'

export interface Problem {
  kind: ProblemKind
  detail: string
  /** A duplicate is not a warning to override: there is nothing to add. */
  blocking?: boolean
}

/** Words that describe this trade. A negative made only of these blocks customers. */
const SERVICE_WORDS = new Set([
  'auto', 'autos', 'car', 'cars', 'truck', 'trucks', 'vehicle', 'vehicles', 'suv', 'van',
  'glass', 'windshield', 'windshields', 'windscreen', 'windscreens', 'window', 'windows',
  'back', 'rear', 'side', 'front', 'door', 'quarter', 'vent',
  'replacement', 'replacements', 'replace', 'replacing', 'replaced', 'repair', 'repairs', 'repairing', 'fix', 'fixing',
  'install', 'installation', 'installer', 'adas', 'calibration', 'calibrate', 'recalibration', 'camera', 'sensor',
  'insurance', 'claim', 'quote', 'quotes', 'estimate', 'cost', 'costs', 'price', 'prices', 'pricing', 'cheap',
  'cheapest', 'affordable', 'best', 'top', 'local', 'near', 'me', 'nearby', 'open', 'now', 'today', 'shop',
  'shops', 'company', 'companies', 'service', 'services', 'specialist', 'specialists', 'oem', 'aftermarket',
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'my', 'to', 'how', 'much', 'is', 'does', 'do', 'it',
])

/** Words that mean "this search is about auto glass": a negative carrying one is likely a customer. */
function glassWords(shop: ShopFacts): Set<string> {
  const w = new Set(['glass', 'windshield', 'windshields', 'windscreen', 'windscreens', 'window', 'windows', 'auto glass'])
  if (shop.offersAdasCalibration) ['adas', 'calibration', 'recalibration', 'camera'].forEach((x) => w.add(x))
  if (shop.offersRockChipRepair || shop.offersWindshieldRepair) ['chip', 'chips', 'crack', 'cracks', 'resin'].forEach((x) => w.add(x))
  if (shop.offersSunroofRepair) ['sunroof', 'moonroof'].forEach((x) => w.add(x))
  if (shop.offersMobileService) w.add('mobile')
  return w
}

const NAME_FILLER = new Set([
  'auto', 'glass', 'windshield', 'windshields', 'windscreen', 'repair', 'replacement', 'services', 'service',
  'and', 'the', 'of', 'inc', 'llc', 'ltd', 'co', 'company', 'calibration', 'mobile', 'solutions', 'group', 'corp',
])

/**
 * The shop's own name, as words and phrases. The stored brand terms, plus
 * every distinctive word of the business name down to THREE letters —
 * `defaultBrandTerms` stops at four, which keeps "ags" out, and "ags" is
 * exactly what AGS's customers type.
 */
export function brandTokens(shop: Pick<ShopFacts, 'businessName' | 'brandTerms'>): string[][] {
  const out: string[][] = []
  const seen = new Set<string>()
  const add = (t: string[]) => {
    const k = t.join(' ')
    if (t.length && !seen.has(k)) {
      seen.add(k)
      out.push(t)
    }
  }
  for (const term of shop.brandTerms) add(tokens(term))
  for (const word of tokens(shop.businessName)) if (word.length >= 3 && !NAME_FILLER.has(word)) add([word])
  return out
}

/** City, service areas, market area and state — as phrases. */
export function placeTokens(shop: Pick<ShopFacts, 'city' | 'state' | 'marketArea' | 'serviceAreas'>): string[][] {
  const out: string[][] = []
  for (const p of [shop.city, shop.marketArea, ...shop.serviceAreas]) {
    // "Portland, OR" → "portland"; a state code is too short to be a word anybody negates by accident.
    const name = (p || '').split(',')[0]
    const t = tokens(name)
    if (t.length) out.push(t)
  }
  return out
}

const INSURER_WORDS = ['aaa', 'geico', 'state farm', 'progressive', 'allstate', 'farmers', 'usaa', 'nationwide', 'liberty mutual', 'travelers', 'esurance', 'safeco']

/**
 * Everything that would make adding this negative a mistake, or a decision
 * for a person. An EMPTY list is the only licence to add it unattended.
 */
export function negativeProblems(
  neg: NegativeProposal,
  ctx: {
    shop: ShopFacts
    /** The searches the trace found. A negative must be built from one of them to go on its own. */
    searchTerms: string[]
    positives: PositiveKeyword[]
    existing: ExistingNegative[]
    /** Admin-typed: the not-from-search rule does not apply. */
    typedByAdmin?: boolean
  }
): Problem[] {
  const problems: Problem[] = []
  const t = tokens(neg.text)
  const text = t.join(' ')

  if (t.length === 0 || text.length < 3) {
    problems.push({ kind: 'too-short', detail: 'Too short to be a useful negative.', blocking: true })
    return problems
  }

  // Already there, at this level or in a list the campaign uses.
  for (const e of ctx.existing) {
    const et = tokens(e.text)
    const sameText = et.join(' ') === text
    const covers =
      (e.matchType === 'PHRASE' && containsPhrase(t, et)) ||
      (e.matchType === 'BROAD' && et.every((w) => t.includes(w))) ||
      (e.matchType === 'EXACT' && sameText && neg.matchType === 'EXACT')
    if ((sameText && e.matchType === neg.matchType) || (covers && neg.matchType !== 'BROAD')) {
      problems.push({
        kind: 'duplicate',
        detail: `Already excluded: ${e.matchType.toLowerCase()} "${e.text}" (${e.where}).`,
        blocking: true,
      })
      return problems
    }
  }

  if (neg.matchType === 'BROAD') {
    problems.push({ kind: 'broad', detail: 'Broad-match negatives block any search with these words in any order — a person decides those.' })
  }

  for (const b of brandTokens(ctx.shop)) {
    if (containsPhrase(t, b) || containsPhrase(b, t)) {
      problems.push({ kind: 'brand', detail: `"${b.join(' ')}" is the shop’s own name.` })
      break
    }
  }

  const glass = glassWords(ctx.shop)
  const glassHit = t.find((w) => glass.has(w)) || (containsPhrase(t, ['auto', 'glass']) ? 'auto glass' : null)
  if (glassHit) {
    problems.push({ kind: 'glass-term', detail: `It contains "${glassHit}" — a search about the glass is more likely a customer, or a competitor worth showing up against.` })
  }

  const places = placeTokens(ctx.shop)
  const isPlace = (w: string) => places.some((p) => p.includes(w))
  if (t.every((w) => SERVICE_WORDS.has(w) || isPlace(w))) {
    problems.push({ kind: 'service-only', detail: 'Every word in it is a service word or a place this shop serves — it would block customers.' })
  } else {
    for (const p of places) {
      if (containsPhrase(t, p) && t.length === p.length) {
        problems.push({ kind: 'place', detail: `"${p.join(' ')}" is in the service area.` })
        break
      }
    }
  }

  // An insurer name ALONE blocks "geico windshield claim" — a customer. With
  // something else beside it ("aaa oregon") it is the roadside search.
  const insurers = [...INSURER_WORDS]
  const pub = ctx.shop.state ? PUBLIC_INSURERS[ctx.shop.state.toUpperCase()] : undefined
  if (pub) insurers.push(pub.short.toLowerCase())
  if (pub && t.includes(pub.short.toLowerCase())) {
    problems.push({ kind: 'insurer', detail: `${pub.short} is the insurer every customer in ${pub.province} claims through.` })
  } else if (neg.matchType !== 'EXACT' && insurers.some((i) => tokens(i).join(' ') === text)) {
    problems.push({ kind: 'insurer', detail: `"${text}" on its own also blocks people looking for glass their insurer covers.` })
  }

  if (t.length === 1 && neg.matchType !== 'EXACT' && !problems.some((p) => p.kind === 'insurer')) {
    problems.push({ kind: 'single-word', detail: `A one-word ${neg.matchType.toLowerCase()} negative blocks every search containing "${text}" — a person decides those.` })
  }

  const blocked = ctx.positives.filter((k) => {
    const kt = tokens(k.text)
    if (neg.matchType === 'EXACT') return kt.join(' ') === text
    if (neg.matchType === 'BROAD') return t.every((w) => kt.includes(w))
    return containsPhrase(kt, t)
  })
  if (blocked.length) {
    const list = blocked.slice(0, 5).map((k) => `"${k.text}"${k.adGroupName ? ` (${k.adGroupName})` : ''}`).join(', ')
    problems.push({ kind: 'blocks-keyword', detail: `It would block keyword${blocked.length === 1 ? '' : 's'} this campaign is buying: ${list}${blocked.length > 5 ? ` and ${blocked.length - 5} more` : ''}.` })
  }

  if (!ctx.typedByAdmin) {
    const fromSearch = ctx.searchTerms.some((s) =>
      neg.matchType === 'EXACT' ? tokens(s).join(' ') === text : containsPhrase(tokens(s), t)
    )
    if (!fromSearch) {
      problems.push({ kind: 'not-from-search', detail: 'It is not taken from any search Google reported for this lead — the model may not add words of its own.' })
    }
  }
  return problems
}

/* ------------------------------------------------------------ auto rules */

/** The most negatives one bad lead may add on its own. */
export const MAX_AUTO_PER_LEAD = 5
/** The most a client's account may get on its own in a day. A runaway loop stops here. */
export const MAX_AUTO_PER_CLIENT_DAY = 15

/**
 * Whether a trace is strong enough for a negative to be added without a
 * person: anything that placed the lead in a campaign. 'day' placed nothing,
 * so its terms are suggestions only.
 */
export function confidenceAllowsAuto(c: Confidence): boolean {
  return c === 'gclid' || c === 'call' || c === 'utm' || c === 'hour'
}

/** What the model returned, read strictly. Anything malformed is dropped, not repaired. */
export function readProposals(raw: unknown): NegativeProposal[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { negatives?: unknown }).negatives)
      ? (raw as { negatives: unknown[] }).negatives
      : []
  const out: NegativeProposal[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const text = tokens(String(o.text ?? '')).join(' ')
    const mt = String(o.match_type ?? o.matchType ?? 'PHRASE').toUpperCase()
    const matchType: MatchType = mt === 'EXACT' ? 'EXACT' : mt === 'BROAD' ? 'BROAD' : 'PHRASE'
    if (!text || text.length > 80 || tokens(text).length > 10) continue
    const key = `${matchType}:${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      text,
      matchType,
      fromTerm: o.from_term != null ? String(o.from_term) : o.fromTerm != null ? String(o.fromTerm) : null,
      why: o.why != null ? String(o.why).slice(0, 300) : undefined,
    })
  }
  return out
}

/**
 * Without the model (no key, or it failed): the same evidence, a narrower
 * answer. The best-match search as an EXACT negative, and any search that
 * carries the reason's own words, exact too. Exact blocks only that search,
 * so this can never take out a customer by containment.
 */
export function fallbackProposals(candidates: Candidate[], reason: string): NegativeProposal[] {
  const out: NegativeProposal[] = []
  for (const c of candidates) {
    if (c.bestMatch || (reason !== 'other' && reasonHits(c.term, reason) > 0)) {
      out.push({ text: tokens(c.term).join(' '), matchType: 'EXACT', fromTerm: c.term, why: c.bestMatch ? 'The search this lead came from.' : `Looks like "${reasonLabel(reason)}".` })
    }
  }
  return out.slice(0, MAX_AUTO_PER_LEAD)
}
