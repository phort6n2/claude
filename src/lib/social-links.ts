/**
 * A shop's social profiles — found on their own website, stored on the client,
 * and passed to the Windshield Repair HQ listing. NOT rendered on the hosted
 * site.
 *
 * WHERE THIS DOES *NOT* COME FROM: the Google Business Profile. A profile can
 * carry social links (Google added the field in 2024, and shops fill it in),
 * but nothing this app can reach returns them. The Places API (New) — what
 * `gbp-reviews.ts` and `place-location.ts` call, and what the Business search
 * on the Business tab uses — has exactly three URL fields in its whole
 * response: `websiteUri`, `googleMapsUri` and `googleMapsLinks`. Checked
 * against Google's own field reference, not remembered. The only API that
 * could return them is the Business Profile API, which is the OWNER's
 * management API: it needs an OAuth grant per location from each shop, which
 * is a separate integration and fifteen conversations. So "import it from the
 * GBP" is not a thing that can be built here today.
 *
 * THE SHOP'S OWN FOOTER IS THE REAL SOURCE, and the importer is already
 * standing in it. Every one of these sites puts its social icons in the
 * footer, the crawler already has that HTML, and an `<a href>` is not a
 * judgement call — so this is deterministic, needs no model, and costs
 * nothing on top of an import somebody is running anyway.
 *
 * THE HARD PART IS THE SHARE BUTTON. A footer's most common Facebook link is
 * not the shop's page, it is "share this page on Facebook" —
 * `facebook.com/sharer/sharer.php?u=…` — and a naive `href*="facebook.com"`
 * grabs it every time. Publish that to a directory and the shop's listing
 * links to a Facebook dialog for sharing somebody's home page. The same
 * applies to `twitter.com/intent/tweet`, `pinterest.com/pin/create` and
 * `linkedin.com/shareArticle`, plus Facebook's tracking pixel at
 * `facebook.com/tr`. Those are screened by shape, not guessed at.
 *
 * A WRONG LINK HERE IS A WRONG FACT ABOUT A BUSINESS ON A PUBLIC PAGE, which
 * is § 2 territory even though it is not our page. So the extractor is only
 * ever a DRAFT: it stages the links, an operator sees what was found on the
 * Business tab, and nothing reaches the directory until the client row is
 * saved.
 */

/** The seven platforms a Google Business Profile itself supports. */
export const SOCIAL_PLATFORMS = [
  'facebook',
  'instagram',
  'x',
  'youtube',
  'tiktok',
  'linkedin',
  'pinterest',
] as const

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export type SocialLinks = Partial<Record<SocialPlatform, string>>

/** Human labels, for the admin card and nothing else. */
export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
}

/**
 * Which platform a host belongs to. Host-suffix matching, so `www.`, `m.`,
 * `en.` and country subdomains all land, and `notfacebook.com` does not.
 */
const HOSTS: Array<[SocialPlatform, RegExp]> = [
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i],
  ['instagram', /(^|\.)instagram\.com$/i],
  ['x', /(^|\.)(x\.com|twitter\.com)$/i],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/i],
  ['tiktok', /(^|\.)tiktok\.com$/i],
  ['linkedin', /(^|\.)linkedin\.com$/i],
  ['pinterest', /(^|\.)pinterest\.[a-z.]{2,6}$/i],
]

export function platformFor(url: string): SocialPlatform | null {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  for (const [platform, re] of HOSTS) if (re.test(host)) return platform
  return null
}

/**
 * Paths that are NOT a profile, per platform.
 *
 * Share and intent endpoints first, because those are the ones a footer
 * actually contains. Then the platform's own furniture (login, help, legal)
 * and single pieces of CONTENT — a post, a reel, one video — which are real
 * but are not the account, and a directory field wants the account.
 */
const NOT_A_PROFILE: Record<SocialPlatform, RegExp[]> = {
  facebook: [
    /^\/(sharer|share|share\.php|sharer\.php|dialog|plugins|tr|login|help|policies|policy|privacy|legal|terms|business|pages\/category)\b/i,
    // A group is a real place and is not the business's page.
    /^\/groups?\//i,
    /^\/(events|watch|marketplace|gaming|hashtag)\//i,
  ],
  instagram: [/^\/(p|reel|reels|tv|explore|accounts|about|legal|developer)\//i],
  x: [
    /^\/(intent|share|home|login|i|hashtag|search|privacy|tos)\b/i,
    /^\/intent\//i,
  ],
  youtube: [
    // A video is not a channel. `youtu.be/<id>` is always a video, handled by
    // the host check below.
    /^\/(watch|embed|shorts|playlist|results|feed|about|t|howyoutubeworks)\b/i,
  ],
  tiktok: [/^\/(video|tag|discover|foryou|login|legal|about)\b/i],
  linkedin: [
    /^\/(shareArticle|sharing|share|sharenew|cws|uas|login|legal|help|feed|posts|pulse)\b/i,
  ],
  pinterest: [/^\/(pin\/create|pin|_|categories|login|about|topics|today)\b/i],
}

/** Tracking noise that does not identify the account. */
const STRIP_PARAMS =
  /^(utm_[a-z_]+|fbclid|gclid|igshid|igsh|ref|ref_src|ref_url|_rdr|_rdc|mibextid|rdid|si|feature|app|is_from_webapp|sender_device|hl|locale)$/i

/**
 * One canonical form per account, so the same profile linked twice is one
 * value and a stored link is comparable to a pasted one.
 *
 * Deliberately conservative: https, host lowercased, `m.` dropped from
 * Facebook (a documented equivalence, and a mobile URL on a directory listing
 * is a worse page for half its readers), tracking params dropped, trailing
 * slash dropped. Nothing else is rewritten — a handle's capitalisation belongs
 * to whoever chose it.
 */
export function normalizeSocialUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^m\.(facebook\.com|fb\.com)$/i, 'www.$1')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (STRIP_PARAMS.test(key)) url.searchParams.delete(key)
  }
  // `profile.php?id=…` is Facebook's own permalink shape, so a query string is
  // not automatically noise — only the params above are.
  let out = url.toString()
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1)
  return out
}

/**
 * Why this URL is not a usable social profile, or null if it is.
 *
 * Shared by the extractor and the admin card, so a pasted link gets the exact
 * screen a scraped one got — otherwise the operator's fix for a rejected
 * scrape is to paste the same bad URL by hand.
 */
export function socialLinkProblem(raw: string): string | null {
  const normalized = normalizeSocialUrl(raw)
  if (!normalized) return 'Not a valid https address'
  const platform = platformFor(normalized)
  if (!platform) return 'Not a recognised social network'
  const url = new URL(normalized)

  // `youtu.be/<id>` is a video share link, never a channel.
  if (/(^|\.)youtu\.be$/i.test(url.hostname)) return 'A YouTube video link, not the channel'

  const path = url.pathname.replace(/\/+$/, '')
  if (!path || path === '/') return `The ${SOCIAL_LABELS[platform]} home page, not an account`

  for (const re of NOT_A_PROFILE[platform]) {
    if (re.test(path)) {
      // Say WHICH kind, because "not a profile" about a share button reads as
      // the screen being broken.
      return /share|intent|sharer|dialog|plugins|^\/tr\b|pin\/create/i.test(path)
        ? `A share button, not the shop’s ${SOCIAL_LABELS[platform]} account`
        : `Not an account page on ${SOCIAL_LABELS[platform]}`
    }
  }
  // A share widget can also carry the target page in a query param rather than
  // the path — `?u=`, `?url=`, `?text=` — which is the other half of the same
  // false positive.
  if (['u', 'url', 'text', 'mini'].some((k) => url.searchParams.has(k))) {
    return `A share button, not the shop’s ${SOCIAL_LABELS[platform]} account`
  }
  return null
}

/** Every href in the document, resolved against the page. */
function hrefsFrom(html: string, base: URL): string[] {
  const out: string[] = []
  const re = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = (match[2] ?? match[3] ?? match[4] ?? '').trim()
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) continue
    try {
      out.push(new URL(raw, base).toString())
    } catch {
      /* a malformed href is not worth a warning */
    }
  }
  return out
}

/**
 * JSON-LD `sameAs`, which is where a site that knows what it is doing already
 * lists these.
 *
 * Read FIRST, for the same reason the content feed prefers an advertised
 * `<link rel="alternate">` over guessing paths, and the logo scorer prefers
 * the JSON-LD logo: an explicit declaration beats anything inferred from
 * markup. A footer's icon row is the fallback.
 */
function sameAsFrom(html: string): string[] {
  const out: string[] = []
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      const same = obj.sameAs
      if (typeof same === 'string') out.push(same)
      if (Array.isArray(same)) for (const s of same) if (typeof s === 'string') out.push(s)
      for (const value of Object.values(obj)) walk(value)
    }
    walk(parsed)
  }
  return out
}

/**
 * The social profiles this page declares or links to — at most one per
 * platform, first usable one wins.
 *
 * Pure: HTML in, a map out. Nothing fetched, nothing stored.
 */
export function socialLinksFrom(html: string, base: URL): SocialLinks {
  const found: SocialLinks = {}
  const pageHost = base.hostname.toLowerCase()
  // Declared before linked. See sameAsFrom.
  for (const candidate of [...sameAsFrom(html), ...hrefsFrom(html, base)]) {
    const normalized = normalizeSocialUrl(candidate)
    if (!normalized) continue
    const platform = platformFor(normalized)
    if (!platform || found[platform]) continue
    /* A LINK ON THE PAGE'S OWN HOST IS NEVER THEIR PROFILE. Relative hrefs
       resolve against the page, so `/contact` on a site whose host happens to
       match a platform's would be read as an account — which is how a check
       written with a careless base URL found an "account" in a footer holding
       none. Nothing is lost by the rule: a shop's social profile is by
       definition not a page on their own website. */
    if (new URL(normalized).hostname.toLowerCase() === pageHost) continue
    if (socialLinkProblem(normalized)) continue
    found[platform] = normalized
  }
  return found
}

/** Merge what a crawl of several pages found, first page's answer winning. */
export function mergeSocialLinks(...sets: SocialLinks[]): SocialLinks {
  const out: SocialLinks = {}
  for (const set of sets) {
    for (const platform of SOCIAL_PLATFORMS) {
      if (!out[platform] && set[platform]) out[platform] = set[platform]
    }
  }
  return out
}

/**
 * Read the stored JSON column back as a clean map.
 *
 * Every value is re-screened on the way out, not merely type-checked: a row
 * written before a rule existed, or by hand, must not reach the directory
 * because it is already in the database.
 */
export function readSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const out: SocialLinks = {}
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = record[platform]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const normalized = normalizeSocialUrl(raw)
    if (normalized && !socialLinkProblem(normalized)) out[platform] = normalized
  }
  return out
}

/** How many platforms are set — for a card's summary line. */
export function countSocialLinks(links: SocialLinks): number {
  return SOCIAL_PLATFORMS.filter((p) => !!links[p]).length
}
