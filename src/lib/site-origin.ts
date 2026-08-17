/**
 * The one host a client's pages call home, and how every other host behaves.
 *
 * A site can answer on several hosts at once — {slug}.glassleads.app, the
 * short {label}.glassleads.app, and any domain the client has pointed here —
 * but canonical URLs, share cards and the sitemap have to name exactly one.
 * Serving identical pages on several hosts without saying which is canonical
 * splits the ranking signal between them.
 *
 * The client's own domain wins when they have one: it is the address they
 * advertise, the one on their Google Business Profile, and the one customers
 * see. But ONLY once it actually works. A domain that is attached and not yet
 * resolving must not become the canonical, or every page on the live
 * subdomain would point search engines at a host that answers nothing.
 *
 * ---------------------------------------------------------------------------
 * Why the non-canonical hosts get noindex WITHOUT a cross-host canonical
 * ---------------------------------------------------------------------------
 * The obvious implementation — noindex on the subdomain plus a canonical
 * pointing at the custom domain — is the one Google warns against. A
 * canonical asserts the two URLs are the same page, which invites the
 * indexer to consolidate signals onto the canonical target; a noindex among
 * those signals can take the canonical target down with it. The failure is
 * silent and it removes the domain the client actually cares about.
 *
 * So the two mechanisms are kept apart:
 *   - canonical host  → indexable, self-canonical, listed in its sitemap
 *   - every other host → noindex (follow), canonical to ITSELF, no sitemap
 *
 * And the non-canonical hosts stay crawlable in robots.txt on purpose.
 * Disallowing them would stop the crawler ever fetching the page, which means
 * never seeing the noindex, which means the duplicates stay indexed forever.
 */

export interface OriginClient {
  slug: string
  siteSubdomain?: string | null
  /** Pre-filtered to the primary domain by the page query. */
  domains?: Array<{ domain: string; verified: boolean; misconfigured: boolean }>
}

/** The fallback host, which always works. */
export function platformHostFor(client: OriginClient): string {
  return `${client.siteSubdomain || client.slug}.glassleads.app`
}

/**
 * The primary custom domain, but only once Vercel confirms it resolves here.
 * An attached-but-not-yet-pointing domain is deliberately ignored.
 */
export function liveCustomHostFor(client: OriginClient): string | null {
  const primary = client.domains?.[0]
  if (!primary) return null
  if (!primary.verified || primary.misconfigured) return null
  return primary.domain
}

export function canonicalHostFor(client: OriginClient): string {
  return liveCustomHostFor(client) || platformHostFor(client)
}

export function siteOriginFor(client: OriginClient): string {
  return `https://${canonicalHostFor(client)}`
}

/** Strip the port and lowercase, so a Host header compares cleanly. */
export function bareHost(host: string | null | undefined): string {
  return (host || '').split(':')[0].toLowerCase()
}

export interface HostStance {
  /** Origin this page should declare as canonical. */
  canonicalOrigin: string
  /** True when the request arrived on the canonical host. */
  isCanonicalHost: boolean
}

/**
 * How this particular request should present itself.
 *
 * On the canonical host: canonical points at the canonical origin, indexable.
 * Anywhere else — the platform subdomain once a custom domain is live, a
 * second custom domain, or the /sites/{slug} preview path on the app host —
 * the page self-canonicalises and asks not to be indexed.
 */
/**
 * The prefix every internal link on this render needs.
 *
 * The SAME HTML serves two shapes of address. On a client host the middleware
 * rewrites `/services/x` to `/sites/{slug}/services/x`, so a link there must
 * be written `/services/x`. On the app host the page is reached at its real
 * route, `/sites/{slug}/services/x`, and a link written `/services/x` would
 * leave the site entirely.
 *
 * Baking `/sites/{slug}` in unconditionally was the old behaviour, and it was
 * wrong on the host that matters: every internal link on a live client site —
 * services, locations, privacy, kept pages — carried the prefix, so a visitor
 * clicking any of them landed on `collision.glassleads.app/sites/collision-…`.
 * Those addresses answer, which is why it went unnoticed, but they are not
 * the ones the pages declare canonical. Google was being shown one URL in the
 * canonical tag and a different one in every link to it.
 *
 * Only a host that provably belongs to THIS client drops the prefix. The app
 * host, localhost and anything unrecognised keep it, because on those the
 * prefixed route is the real one.
 */
export function sitePathPrefixFor(
  client: OriginClient,
  requestHost: string | null | undefined
): string {
  const host = bareHost(requestHost)
  if (!host) return `/sites/${client.slug}`

  if (client.domains?.some((d) => bareHost(d.domain) === host)) return ''

  if (host.endsWith('.glassleads.app')) {
    const label = host.slice(0, -'.glassleads.app'.length)
    if (label && label === (client.siteSubdomain || '').toLowerCase()) return ''
    if (label && label === client.slug.toLowerCase()) return ''
  }

  return `/sites/${client.slug}`
}

export function hostStanceFor(client: OriginClient, requestHost: string | null | undefined): HostStance {
  const canonicalHost = canonicalHostFor(client)
  const host = bareHost(requestHost)

  // No host to compare (a build-time or internal render): assume canonical
  // rather than emitting a noindex we cannot justify.
  if (!host || host === canonicalHost) {
    return { canonicalOrigin: `https://${canonicalHost}`, isCanonicalHost: true }
  }

  return { canonicalOrigin: `https://${host}`, isCanonicalHost: false }
}
