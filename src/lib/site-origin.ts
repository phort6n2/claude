/**
 * The one host a client's pages call home.
 *
 * A site can answer on several hosts at once — {slug}.glassleads.app, the
 * short {label}.glassleads.app, and any domain the client has pointed here —
 * but canonical URLs, share cards and the sitemap have to name exactly one.
 * Serving identical pages on several hosts without saying which is canonical
 * splits the ranking signal between them.
 *
 * The client's own domain wins when they have one: it is the address they
 * advertise, the one that appears in their Google Business Profile, and the
 * one customers will see.
 */

export interface OriginClient {
  slug: string
  siteSubdomain?: string | null
  /** Pre-filtered to the primary domain by the page query. */
  domains?: Array<{ domain: string }>
}

export function siteOriginFor(client: OriginClient): string {
  const custom = client.domains?.[0]?.domain
  if (custom) return `https://${custom}`
  return `https://${client.siteSubdomain || client.slug}.glassleads.app`
}
