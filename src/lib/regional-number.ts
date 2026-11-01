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
 *   2. AN AD CLICK shows the number of the campaign it came from, ON EVERY
 *      PAGE — `gad_campaignid`, which Google adds to every ad click,
 *      remembered in the landing cookie for the visit like the platform is.
 *      Matched against `adCampaignIds`.
 *      THIS USED TO COME AFTER THE CITY PAGE, and the owner reversed it
 *      (2026-11-01). A Google Ads campaign can carry one call number reliably —
 *      with two call assets Google picks which shows, and not by where the
 *      searcher is — so the campaign IS the region: the caller must see the
 *      number from the ad's call button on the landing page and on every page
 *      after, or the call is credited to the wrong campaign. Speedy folded
 *      Riverside into LA+OC for exactly that reason.
 *   3. With no campaign rule: a CITY PAGE shows its region's number, matched
 *      on the page's area name against the number's `showForAreas`.
 *   4. Then, on a shared page, the region of the CITY PAGE THE VISIT LANDED ON
 *      — remembered in the landing cookie, so an organic visitor who arrives on
 *      /auto-glass-repair-temecula and opens /windshield-replacement keeps that
 *      region's line. Matched by URL slug against the same `showForAreas`, so
 *      there is nothing to set per page.
 *   5. Everyone else sees the default (`useOnSite`), as always.
 *
 * A shop with one number has no rules set, so steps 2–4 never match and
 * everything reads exactly as before.
 */

export interface SiteNumber {
  phoneNumber: string
  useOnSite: boolean
  showTo: string | null
  showForAreas: string[]
  adCampaignIds: string[]
}

export type NumberWhy = 'platform' | 'area' | 'landing' | 'campaign' | 'default'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The URL slug of an area name — the SAME transform as `citySlug` in
 * site-locations.ts, which is what builds /auto-glass-repair-{slug}. Restated
 * because this module stays import-free; check-regional-number.ts asserts the
 * two agree, so they cannot drift without a failing check.
 */
export function areaSlug(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

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
  ctx: {
    platform: string | null
    area: string | null
    adCampaignId: string | null
    /** The city-page slug the visit LANDED on (traffic-source.ts `landingCitySlug`). */
    landingCity?: string | null
  }
): { phoneNumber: string; why: NumberWhy } | null {
  if (ctx.platform) {
    const own = numbers.find((n) => n.showTo === ctx.platform)
    if (own) return { phoneNumber: own.phoneNumber, why: 'platform' }
  }
  // The campaign BEFORE the page — see step 2 in the header for why.
  if (ctx.adCampaignId) {
    const byCampaign = numbers.find((n) => n.adCampaignIds.includes(ctx.adCampaignId!))
    if (byCampaign) return { phoneNumber: byCampaign.phoneNumber, why: 'campaign' }
  }
  if (ctx.area) {
    const area = norm(ctx.area)
    const byArea = numbers.find((n) => n.showForAreas.some((a) => norm(a) === area))
    if (byArea) return { phoneNumber: byArea.phoneNumber, why: 'area' }
  }
  if (ctx.landingCity) {
    const slug = ctx.landingCity
    const byLanding = numbers.find((n) => n.showForAreas.some((a) => areaSlug(a) === slug))
    if (byLanding) return { phoneNumber: byLanding.phoneNumber, why: 'landing' }
  }
  const def = numbers.find((n) => n.useOnSite)
  return def ? { phoneNumber: def.phoneNumber, why: 'default' } : null
}
