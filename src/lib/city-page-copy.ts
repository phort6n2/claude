/**
 * What a city page's headline, lead-in and meta description say the shop does
 * to a windshield. Import-free, so scripts/check-city-page-copy.ts can run it.
 *
 * The city page said "windshield repair and replacement" for every shop. AGS
 * replaces only — rock chip and windshield repair are both unticked — so the
 * H1 on the three pages its ads point at named the one service it does not
 * offer, directly above a services grid that (correctly) did not list it.
 * "Repair" is a claim, and it is now made only when a repair service is ticked.
 * Rock chip repair counts: it is the same resin injection, and a shop that
 * offers it does repair windshields (see the chips note in story-sections.ts).
 */

export interface WindshieldFlags {
  offersWindshieldRepair: boolean
  offersRockChipRepair: boolean
  offersWindshieldReplacement: boolean
}

export type WindshieldWork = 'repair and replacement' | 'replacement' | 'repair'

export function windshieldWork(flags: WindshieldFlags): WindshieldWork {
  const repair = flags.offersWindshieldRepair || flags.offersRockChipRepair
  if (repair && !flags.offersWindshieldReplacement) return 'repair'
  if (!repair && flags.offersWindshieldReplacement) return 'replacement'
  // Both, or (a half-filled record) neither: what every shop read before.
  return 'repair and replacement'
}

/**
 * The H1. A shop with a repair service reads exactly what it always did; a
 * replacement-only shop gets "Windshield Replacement in {city}", the owner's
 * wording for AGS.
 */
export function cityHeadline(work: WindshieldWork, area: string): string {
  if (work === 'replacement') return `Windshield Replacement in ${area}`
  if (work === 'repair') return `Windshield repair in ${area}`
  return `Windshield repair and replacement in ${area}`
}

/**
 * The meta description. Every clause is a stored fact or is omitted:
 * - the network only when `networkHighlight` returned one (ticked, and a
 *   network name this platform has confirmed) — the same gate as the badge;
 * - the rating only from the live Business Profile feed, never typed;
 * - NO warranty: a named warranty must state its terms (§2), and a snippet
 *   cannot; the page's warranty band does.
 * - NO "in minutes": a timing promise.
 */
export function cityMetaDescription(input: {
  work: WindshieldWork
  area: string
  state: string
  mobile: boolean
  networkLabel: string | null
  rating: { rating: number; reviewCount: number } | null
  businessName: string
  phone: string
}): string {
  const trust = [
    input.networkLabel ? `${input.networkLabel} shop` : null,
    input.rating && input.rating.reviewCount > 0 && input.rating.rating > 0
      ? `${input.rating.rating.toFixed(1)} stars on Google`
      : null,
  ].filter(Boolean)
  const lead = `${input.mobile ? 'Mobile windshield' : 'Windshield'} ${input.work} in ${input.area}, ${input.state}.`
  return [lead, trust.length ? `${trust.join(', ')}.` : null, `Free quotes from ${input.businessName}.`, input.phone ? `Call ${input.phone}.` : null]
    .filter(Boolean)
    .join(' ')
}
