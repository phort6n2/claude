/**
 * WHERE A VISITOR CAME FROM — decided once, on landing, and remembered.
 *
 * Pure and import-free on purpose: middleware runs on the Edge and reads this
 * on every page request, and the intake, the widget's served script and the
 * check script read the same rules. One decision, four readers.
 *
 * ---------------------------------------------------------------------------
 * The order is the evidence order
 * ---------------------------------------------------------------------------
 *
 *   1. A CLICK ID. gclid/gbraid/wbraid are Google's, msclkid is Microsoft's,
 *      fbclid is Meta's. An ad network appends it to the click, so it is the
 *      only thing on a URL that proves an ad sent this visitor — except
 *      Google's own gad_source/gad_campaignid, which prove a Google ad click
 *      when a privacy browser has stripped the gclid (`GOOGLE_ADS_PARAMS`).
 *   2. utm_source, which somebody typed into a campaign's URL template.
 *   3. The REFERRER — an organic search or a shared post. It names a platform
 *      but proves no ad, so it never selects a platform's phone number (see
 *      `numberSourceFor`): a person who found AGK on Bing's organic results
 *      calling the Microsoft number would credit the Microsoft campaign with a
 *      call it did not buy.
 *   4. Nothing — direct, or a visit nobody can account for.
 *
 * ---------------------------------------------------------------------------
 * What a later visit is allowed to change
 * ---------------------------------------------------------------------------
 *
 * A paid touch (click ID or UTM) is replaced only by another paid touch,
 * within MAX_AGE_DAYS. A returning visitor who types the address in, or comes
 * back through an organic search, is still the person the Meta ad found —
 * replacing that with "direct" is how a paid lead ends up credited to nobody.
 * A referrer touch is replaced by anything with evidence. Internal navigation
 * changes nothing at all.
 *
 * `fbclid` is appended to EVERY outbound link Facebook and Instagram render,
 * ads and ordinary shared posts alike, so on its own it says "Meta", not "a
 * Meta ad". The medium carries the difference: `paid` when the campaign's own
 * utm_medium says so (the URL template we give for Meta does), `social`
 * otherwise. The platform is the same either way, so a Meta visitor sees the
 * Meta number whichever it was.
 */

export const TRAFFIC_SOURCES = ['google', 'microsoft', 'meta', 'other', 'direct', 'unknown'] as const
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number]

export const TRAFFIC_MEDIUMS = ['paid', 'organic', 'social', 'referral', 'email', 'other', 'none'] as const
export type TrafficMedium = (typeof TRAFFIC_MEDIUMS)[number]

/** Platforms that can have a tracking number of their own on the site. */
export const NUMBER_SOURCES = ['microsoft', 'meta'] as const
export type NumberSource = (typeof NUMBER_SOURCES)[number]

export type Evidence = 'click' | 'utm' | 'referrer' | 'none'

export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'] as const
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number]

/**
 * GOOGLE ADS' OWN AGGREGATE PARAMETERS — evidence of a Google ad click when
 * the click id itself is gone.
 *
 * Google appends gad_source (the ad network) and gad_campaignid (the campaign)
 * to the final URL of an AD click, beside the gclid; they never appear on an
 * organic result (support.google.com/google-ads/answer/13327296). Privacy
 * browsers and Safari's Link Tracking Protection strip the gclid as a known
 * identifier and leave these — they identify nobody — so a real Google ad
 * visitor arrived with gad_source=1&gad_campaignid=… and no gclid, and was
 * labelled "direct" (or "Google (organic)" when the referrer survived). Nima's
 * lead at AGK on 2026-10-18 was exactly that, from a browser sending GPC.
 *
 * Evidence, not a click id: there is nothing to upload as an offline
 * conversion, so `gclid` stays empty and the "booked jobs back to Google" path
 * is unaffected. Only Google's params — `gc_id`/`g_special_campaign` ride on
 * the same URLs but are undocumented, and a rule built on an undocumented
 * parameter is one Google can change underneath.
 */
export const GOOGLE_ADS_PARAMS = ['gad_source', 'gad_campaignid'] as const

/** Does this URL carry Google Ads' own parameters? */
export function hasGoogleAdsParams(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const q = new URL(url).searchParams
    return GOOGLE_ADS_PARAMS.some((k) => !!clean(q.get(k)))
  } catch {
    return false
  }
}
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
export type UtmKey = (typeof UTM_KEYS)[number]

/** The first-party cookie. Readable by the widget, so not httpOnly. */
export const SOURCE_COOKIE = 'gl_src'
/** The request header middleware hands the page — never trusted from outside. */
export const SOURCE_HEADER = 'x-gl-src'
export const MAX_AGE_DAYS = 90
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000
/** A click id is an opaque token; anything longer than this is not one. */
const MAX_VALUE = 300

export interface Touch {
  source: TrafficSource
  medium: TrafficMedium
  evidence: Evidence
  campaign: string | null
  clickIds: Partial<Record<ClickIdKey, string>>
  utm: Partial<Record<UtmKey, string>>
  landingPage: string | null
  referrer: string | null
  /** The first time this browser was ever seen on the site. Never moves. */
  firstSeenAt: number
  /** When the touch that decided `source` happened — the 90 days run from here. */
  touchedAt: number
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  if (!t || t.length > MAX_VALUE) return null
  return t
}

const PAID_MEDIUM = /^(cpc|ppc|paid|paid[_-]?(search|social|media)|paidsocial|cpm|cpv|display|ads?|sem|retargeting)$/i
const SOCIAL_MEDIUM = /^(social|organic[_-]?social|social[_-]?organic|post)$/i

function mediumFromUtm(utmMedium: string | null): TrafficMedium | null {
  if (!utmMedium) return null
  if (PAID_MEDIUM.test(utmMedium)) return 'paid'
  if (SOCIAL_MEDIUM.test(utmMedium)) return 'social'
  if (/^e-?mail$/i.test(utmMedium)) return 'email'
  if (/^organic$/i.test(utmMedium)) return 'organic'
  if (/^referral$/i.test(utmMedium)) return 'referral'
  return 'other'
}

/** utm_source as people actually type it, onto a platform. */
export function sourceFromUtm(utmSource: string | null): TrafficSource | null {
  if (!utmSource) return null
  const s = utmSource.toLowerCase().trim()
  if (/^(google|adwords|google[_-]?ads|googleads)$/.test(s)) return 'google'
  if (/^(bing|microsoft|msn|microsoft[_-]?ads|bing[_-]?ads)$/.test(s)) return 'microsoft'
  if (/^(facebook|fb|instagram|ig|meta|an|msg|messenger|audience[_-]?network)$/.test(s)) return 'meta'
  return 'other'
}

/**
 * A referrer's host onto a platform, or null when it is the site itself (or
 * nothing). Matched on the registrable part, so google.ca and m.facebook.com
 * count, and a shop called "googleglass.com" does not.
 */
export function sourceFromReferrer(
  referrer: string | null,
  ownHost: string | null
): { source: TrafficSource; medium: TrafficMedium } | null {
  if (!referrer) return null
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host) return null
  const own = (ownHost || '').toLowerCase().split(':')[0]
  if (own && (host === own || host === `www.${own}` || `www.${host}` === own)) return null
  if (/(^|\.)google\.[a-z.]{2,6}$/.test(host)) return { source: 'google', medium: 'organic' }
  if (/(^|\.)bing\.com$/.test(host)) return { source: 'microsoft', medium: 'organic' }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|messenger\.com)$/.test(host)) {
    return { source: 'meta', medium: 'social' }
  }
  if (/(^|\.)(duckduckgo\.com|yahoo\.com|ecosia\.org|baidu\.com|yandex\.[a-z]+)$/.test(host)) {
    return { source: 'other', medium: 'organic' }
  }
  return { source: 'other', medium: 'referral' }
}

export interface Landing {
  /** The full URL of the page landed on (query included). */
  url: string
  referrer: string | null
  now: number
}

/** What THIS request says on its own, before anything remembered is consulted. */
export function touchFromLanding(landing: Landing): Omit<Touch, 'firstSeenAt'> | null {
  let u: URL
  try {
    u = new URL(landing.url)
  } catch {
    return null
  }
  const q = u.searchParams
  const clickIds: Touch['clickIds'] = {}
  for (const k of CLICK_ID_KEYS) {
    const v = clean(q.get(k))
    if (v) clickIds[k] = v
  }
  const utm: Touch['utm'] = {}
  for (const k of UTM_KEYS) {
    const v = clean(q.get(k))
    if (v) utm[k] = v
  }
  const landingPage = `${u.origin}${u.pathname}${u.search}`.slice(0, 1000)
  const referrer = clean(landing.referrer)
  const utmMedium = utm.utm_medium || null
  const campaign = utm.utm_campaign || null
  const base = { clickIds, utm, landingPage, referrer, campaign, touchedAt: landing.now }

  // 1. Click ids, in the stated order.
  if (clickIds.gclid || clickIds.gbraid || clickIds.wbraid) {
    return { ...base, source: 'google', medium: 'paid', evidence: 'click' }
  }
  if (clickIds.msclkid) return { ...base, source: 'microsoft', medium: 'paid', evidence: 'click' }
  if (clickIds.fbclid) {
    const m = mediumFromUtm(utmMedium)
    return { ...base, source: 'meta', medium: m === 'paid' ? 'paid' : 'social', evidence: 'click' }
  }
  // 1b. Google Ads' own parameters, where the gclid was stripped. Ahead of
  // utm_source because Google writes these and a person types the UTM.
  if (GOOGLE_ADS_PARAMS.some((k) => clean(q.get(k)))) {
    return {
      ...base,
      campaign: campaign || clean(q.get('gad_campaignid')),
      source: 'google',
      medium: 'paid',
      evidence: 'utm',
    }
  }
  // 2. utm_source.
  const fromUtm = sourceFromUtm(utm.utm_source || null)
  if (fromUtm) {
    return { ...base, source: fromUtm, medium: mediumFromUtm(utmMedium) || 'other', evidence: 'utm' }
  }
  // 2b. The Meta landing page itself. ?v=meta exists only to be the website
  // URL of a Meta ad, so it is Meta evidence in its own right — and it is the
  // one that SURVIVES: iOS Link Tracking Protection strips fbclid in Mail,
  // Messages and private Safari, and an ad set up without the URL parameters
  // carries no utm_source. Without this a real Meta click could land on the
  // Meta page and be shown the default number, which is exactly what opening
  // the page by hand to check it did. After the click ids and UTMs, so a
  // gclid or a stated utm_source still decides.
  if ((q.get('v') || '').toLowerCase() === 'meta') {
    return { ...base, source: 'meta', medium: mediumFromUtm(utmMedium) || 'paid', evidence: 'utm' }
  }
  // 3. Referrer.
  const fromRef = sourceFromReferrer(referrer, u.host)
  if (fromRef) return { ...base, ...fromRef, evidence: 'referrer' }
  // 4. Nothing this request can say.
  return null
}

const RANK: Record<Evidence, number> = { none: 0, referrer: 1, utm: 2, click: 2 }

/**
 * Fold a landing into what was remembered. Returns the touch to keep and
 * whether it changed — middleware writes the cookie only when it did, so a
 * visitor clicking around the site is not sent a fresh Set-Cookie per page.
 */
export function mergeTouch(prev: Touch | null, landing: Landing): { touch: Touch; changed: boolean } {
  const live = prev && landing.now - prev.touchedAt <= MAX_AGE_MS ? prev : null
  const firstSeenAt = prev?.firstSeenAt && prev.firstSeenAt <= landing.now ? prev.firstSeenAt : landing.now
  const fresh = touchFromLanding(landing)

  if (fresh && (!live || RANK[fresh.evidence] >= RANK[live.evidence])) {
    return { touch: { ...fresh, firstSeenAt }, changed: true }
  }
  if (live) return { touch: live, changed: live !== prev }
  // Nothing remembered (or it expired) and nothing on this request: direct.
  const direct: Touch = {
    source: 'direct',
    medium: 'none',
    evidence: 'none',
    campaign: null,
    clickIds: {},
    utm: {},
    landingPage: (() => {
      try {
        const u = new URL(landing.url)
        return `${u.origin}${u.pathname}${u.search}`.slice(0, 1000)
      } catch {
        return null
      }
    })(),
    referrer: clean(landing.referrer),
    firstSeenAt,
    touchedAt: landing.now,
  }
  return { touch: direct, changed: true }
}

/**
 * The phone number a touch is entitled to. Only an AD's evidence selects a
 * platform's number — a click id or a campaign UTM — and Google is never
 * selected here: Google visitors see the site's default number, which is the
 * number Google's own website-call swap is configured against, so its
 * behaviour stays exactly as it was.
 */
export function numberSourceFor(touch: Pick<Touch, 'source' | 'evidence'> | null): NumberSource | null {
  if (!touch) return null
  if (touch.evidence !== 'click' && touch.evidence !== 'utm') return null
  return touch.source === 'microsoft' || touch.source === 'meta' ? touch.source : null
}

/** The site's "Your Privacy Choices" cookie (components/sites/PrivacyChoices.tsx). */
export const OPT_OUT_COOKIE = 'gl_optout'

/**
 * The platform number, after the visitor's privacy choice.
 *
 * A call to the META number is reported to Meta (meta-capi.ts,
 * `queueMetaPhoneLead`), with the caller's number hashed. A visitor who opted
 * out — Global Privacy Control, or the footer link — has said not to share
 * with advertisers, and nothing on a phone call can carry that choice to the
 * server afterwards. So the choice is honoured where it still exists, on the
 * page: they see the default number, and their call is never Meta's to hear
 * about. The cost is that one call is counted under "unknown" instead of
 * Meta, which is the right way round for a California shop.
 *
 * Microsoft's number is unaffected: a call to it is attributed in our own
 * database and sent nowhere.
 */
export function numberSourceAfterOptOut(platform: NumberSource | null, optedOut: boolean): NumberSource | null {
  return platform === 'meta' && optedOut ? null : platform
}

/**
 * The lead's trafficSource for a call or text to a tracking number. A call
 * carries no click id, so the NUMBER is the evidence: a Microsoft or Meta
 * number is only ever shown to visitors those ads sent. The default number is
 * everyone else — Google, organic, the Business Profile, a returning customer
 * — so it says "unknown" rather than guessing which.
 */
export function trafficSourceForNumber(number: { showTo?: string | null }): TrafficSource {
  return number.showTo === 'microsoft' || number.showTo === 'meta' ? number.showTo : 'unknown'
}

export const AD_PLATFORMS = ['google', 'microsoft', 'meta'] as const
export type AdPlatform = (typeof AD_PLATFORMS)[number]

/**
 * The ad platform that PAID for a lead, or null — for counting, as in the
 * monthly report's "where they came from".
 *
 * Stricter than `trafficSource`, which also says google for an organic search
 * visitor and meta for somebody who tapped a link in an ordinary Facebook post
 * (fbclid rides on every outbound Facebook link, which is why the backfill
 * marks those `social`). So: a form lead needs `paid` — a click id, or the
 * `utm_medium=paid` the Meta setup steps put on every ad — and a call or text
 * needs to have reached that platform's own number, which is only ever shown
 * to visitors its ads sent. A call to the default number is null whoever made
 * it: that number is Google's AND everybody else's, and nothing on the call
 * says which.
 */
export function adPlatformOf(lead: {
  source?: string | null
  trafficSource?: string | null
  trafficMedium?: string | null
}): AdPlatform | null {
  const platform = oneOf(AD_PLATFORMS, lead.trafficSource)
  if (!platform) return null
  if (lead.trafficMedium === 'paid') return platform
  const byNumber = (lead.source === 'PHONE' || lead.source === 'SMS') && platform !== 'google'
  return byNumber ? platform : null
}

// ---------------------------------------------------------------------------
// Cookie encoding. Short keys: the cookie rides on every request to the site.
// ---------------------------------------------------------------------------

interface Wire {
  v: 1
  s: TrafficSource
  m: TrafficMedium
  e: Evidence
  c?: string
  k?: Touch['clickIds']
  u?: Touch['utm']
  l?: string
  r?: string
  f: number
  t: number
}

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeTouch(t: Touch): string {
  const w: Wire = { v: 1, s: t.source, m: t.medium, e: t.evidence, f: t.firstSeenAt, t: t.touchedAt }
  if (t.campaign) w.c = t.campaign
  if (Object.keys(t.clickIds).length) w.k = t.clickIds
  if (Object.keys(t.utm).length) w.u = t.utm
  // The landing page and referrer can be long; the cookie keeps a capped copy
  // and the widget's own storage keeps the rest.
  if (t.landingPage) w.l = t.landingPage.slice(0, 400)
  if (t.referrer) w.r = t.referrer.slice(0, 200)
  return b64urlEncode(JSON.stringify(w))
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null
}

function pickStrings<K extends string>(keys: readonly K[], v: unknown): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  if (!v || typeof v !== 'object') return out
  for (const k of keys) {
    const s = clean((v as Record<string, unknown>)[k] as string)
    if (s) out[k] = s
  }
  return out
}

/** Anything unreadable is treated as no cookie at all, never as an error. */
export function decodeTouch(value: string | null | undefined): Touch | null {
  if (!value) return null
  try {
    const w = JSON.parse(b64urlDecode(value)) as Partial<Wire>
    if (w.v !== 1) return null
    const source = oneOf(TRAFFIC_SOURCES, w.s)
    const medium = oneOf(TRAFFIC_MEDIUMS, w.m)
    const evidence = oneOf(['click', 'utm', 'referrer', 'none'] as const, w.e)
    if (!source || !medium || !evidence) return null
    if (typeof w.f !== 'number' || typeof w.t !== 'number') return null
    return {
      source,
      medium,
      evidence,
      campaign: clean(w.c),
      clickIds: pickStrings(CLICK_ID_KEYS, w.k),
      utm: pickStrings(UTM_KEYS, w.u),
      landingPage: clean(w.l) ? String(w.l).slice(0, 1000) : null,
      referrer: clean(w.r),
      firstSeenAt: w.f,
      touchedAt: w.t,
    }
  } catch {
    return null
  }
}

/**
 * The page's view of the source: middleware sets SOURCE_HEADER to the number
 * source alone, so the page never re-parses the cookie and an outside caller
 * cannot pick a number by sending a header (middleware overwrites it).
 */
export function numberSourceFromHeader(value: string | null | undefined): NumberSource | null {
  return oneOf(NUMBER_SOURCES, value)
}

// ---------------------------------------------------------------------------
// The lead's columns. One function, read by the intake for a form and by the
// backfill's rules, so a lead is labelled the same way however it arrived.
// ---------------------------------------------------------------------------

export interface LeadAttributionInput {
  /** As the widget posts them (its own storage, then the cookie). */
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  msclkid?: string | null
  fbclid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  /** The widget's own reading of the cookie, when it sent one. */
  trafficSource?: string | null
  trafficMedium?: string | null
  referrer?: string | null
  landingPage?: string | null
}

/**
 * Source and medium for a lead from whatever it carries. The cookie's verdict
 * is preferred when it agrees with the evidence on the lead, and the click
 * ids always win over it: a lead carrying an msclkid is a Microsoft lead even
 * if a cookie written by an older version of the widget says otherwise.
 */
export function leadTrafficSource(input: LeadAttributionInput): { source: TrafficSource; medium: TrafficMedium } {
  if (input.gclid || input.gbraid || input.wbraid) return { source: 'google', medium: 'paid' }
  if (input.msclkid) return { source: 'microsoft', medium: 'paid' }
  if (input.fbclid) {
    return { source: 'meta', medium: mediumFromUtm(input.utmMedium || null) === 'paid' ? 'paid' : 'social' }
  }
  const claimed = oneOf(TRAFFIC_SOURCES, input.trafficSource)
  const claimedMedium = oneOf(TRAFFIC_MEDIUMS, input.trafficMedium)
  // A paid verdict stands — it is the latest ad touch, by the replacement rule
  // above. Anything weaker loses to Google Ads' own parameters on the landing
  // page: a cookie written before this rule existed said "direct" for exactly
  // the visitors it is for.
  if (claimed && claimed !== 'unknown' && claimedMedium === 'paid') return { source: claimed, medium: 'paid' }
  if (hasGoogleAdsParams(input.landingPage)) return { source: 'google', medium: 'paid' }
  if (claimed && claimed !== 'unknown') return { source: claimed, medium: claimedMedium || 'other' }
  const fromUtm = sourceFromUtm(input.utmSource || null)
  if (fromUtm) return { source: fromUtm, medium: mediumFromUtm(input.utmMedium || null) || 'other' }
  let ownHost: string | null = null
  try {
    ownHost = input.landingPage ? new URL(input.landingPage).host : null
  } catch {
    ownHost = null
  }
  const fromRef = sourceFromReferrer(input.referrer || null, ownHost)
  if (fromRef) return fromRef
  return { source: 'direct', medium: 'none' }
}

/** Human labels, shared by the lead lists and the portal. */
export const TRAFFIC_SOURCE_LABELS: Record<TrafficSource, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  meta: 'Meta',
  other: 'Other',
  direct: 'Direct',
  unknown: 'Unknown',
}

export function trafficSourceLabel(source: string | null | undefined, medium?: string | null): string {
  const s = oneOf(TRAFFIC_SOURCES, source)
  if (!s) return 'Unknown'
  const base = TRAFFIC_SOURCE_LABELS[s]
  if (s === 'direct' || s === 'unknown') return base
  if (medium === 'paid') return `${base} Ads`
  if (medium === 'organic') return `${base} (organic)`
  if (medium === 'social') return `${base} (social)`
  return base
}
