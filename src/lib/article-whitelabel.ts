/**
 * Which hosts belong to a content or scheduling supplier.
 *
 * §2's white-label rule: a client must never learn which supplier produced
 * their content. They pay this platform; a supplier's name on their own page
 * is an invitation to go straight to the supplier.
 *
 * NOTHING CALLS THIS RIGHT NOW. The syndicated-article integration it was
 * written for is gone, and the shop's own RSS feed replaced it — a feed has no
 * field for who wrote a post, so the rule is currently enforced by the format
 * rather than by code. What survives here is the list and the test, because
 * the next supplier whose content this app RENDERS will need them, and because
 * the list is the part that is tedious to reconstruct.
 *
 * The three leaks that rule has to cover, recorded so they are not rediscovered
 * the hard way — none of them is a UI string, which is what makes them easy to
 * miss:
 *
 * - **Images.** Anything left on the supplier's CDN puts their hostname in the
 *   page source, the network tab, and the `og:image` that gets shared. Copy it
 *   onto our own storage at ingest — `photo-mirror.ts` already does this for
 *   imported site photos and is the tool for it.
 * - **JSON-LD.** `author`, `publisher`, `creator` and friends come back naming
 *   the supplier. Machine readable, indexed, and invisible in the rendered
 *   page is the worst combination available. Rewrite them to the shop.
 * - **Links in the body.** A supplier backlink survives an HTML sanitiser,
 *   because a sanitiser asks whether markup can execute, not whose name is on
 *   it. Drop the `href`, keep the text.
 */

/**
 * Add every host a supplier serves from, not just their apex — CDNs and app
 * subdomains are exactly what shows up in a page source.
 */
export const VENDOR_HOSTS = ['babylovegrowth.ai', 'robinreach.com'] as const

/** True for the host itself and any subdomain of it. */
export function isVendorHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return VENDOR_HOSTS.some((vendor) => h === vendor || h.endsWith(`.${vendor}`))
}

/** True when a URL string points at a supplier. Unparseable URLs are not. */
export function isVendorUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    return isVendorHost(new URL(value, 'https://placeholder.invalid').hostname)
  } catch {
    return false
  }
}
