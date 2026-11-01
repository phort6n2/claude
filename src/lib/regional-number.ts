/**
 * WHICH TRACKING NUMBER A PAGE SHOWS, when a shop has one per region.
 * Import-free, so scripts/check-regional-number.ts can run it.
 *
 * Speedy runs three lines — San Diego, LA/OC and Riverside — and the site used
 * to show ONE default number on every page: a Riverside customer reading the
 * Riverside page saw the San Diego line, and every call landed on one number
 * whatever region's ad had bought it. The owner's rule, in order:
 *
 *   1. An ad platform's own number (Microsoft, Meta) for that platform's
 *      visitors — unchanged, and first, because it is what attributes a call
 *      that carries no click id (lib/traffic-source.ts).
 *   2. A CITY PAGE shows its region's number: the page is about that place,
 *      and a local line on it is the point. Matched on the page's area name
 *      against the number's `showForAreas`.
 *   3. On a shared page (home, a service page, the claims page) an AD CLICK
 *      shows the number of the campaign it came from — `gad_campaignid`, which
 *      Google adds to every ad click, remembered in the landing cookie for the
 *      visit like the platform is. Matched against `adCampaignIds`.
 *   4. Everyone else — organic, direct, the Business Profile — sees the
 *      default (`useOnSite`), as always.
 *
 * A shop with one number has no rules set, so steps 2 and 3 never match and
 * everything reads exactly as before.
 */

export interface SiteNumber {
  phoneNumber: string
  useOnSite: boolean
  showTo: string | null
  showForAreas: string[]
  adCampaignIds: string[]
}

export type NumberWhy = 'platform' | 'area' | 'campaign' | 'default'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Campaign ids are digits; anything else typed in is ignored rather than half-matched. */
export function cleanCampaignIds(values: unknown): string[] {
  const list = Array.isArray(values) ? values : String(values ?? '').split(/[\s,]+/)
  const out: string[] = []
  for (const v of list) {
    const d = String(v ?? '').replace(/[^0-9]/g, '')
    if (d.length >= 6 && !out.includes(d)) out.push(d)
  }
  return out
}

/** Area names as typed, one per comma or line, de-duplicated by spelling. */
export function cleanAreas(values: unknown): string[] {
  const list = Array.isArray(values) ? values : String(values ?? '').split(/[\n,]+/)
  const out: string[] = []
  for (const v of list) {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ')
    if (t && !out.some((o) => norm(o) === norm(t))) out.push(t)
  }
  return out
}

export function pickSiteNumber(
  numbers: SiteNumber[],
  ctx: { platform: string | null; area: string | null; adCampaignId: string | null }
): { phoneNumber: string; why: NumberWhy } | null {
  if (ctx.platform) {
    const own = numbers.find((n) => n.showTo === ctx.platform)
    if (own) return { phoneNumber: own.phoneNumber, why: 'platform' }
  }
  if (ctx.area) {
    const area = norm(ctx.area)
    const byArea = numbers.find((n) => n.showForAreas.some((a) => norm(a) === area))
    if (byArea) return { phoneNumber: byArea.phoneNumber, why: 'area' }
  }
  if (ctx.adCampaignId) {
    const byCampaign = numbers.find((n) => n.adCampaignIds.includes(ctx.adCampaignId!))
    if (byCampaign) return { phoneNumber: byCampaign.phoneNumber, why: 'campaign' }
  }
  const def = numbers.find((n) => n.useOnSite)
  return def ? { phoneNumber: def.phoneNumber, why: 'default' } : null
}
