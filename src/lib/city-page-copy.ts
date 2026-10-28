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

import { siteDescription } from './meta-description'

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
 * The meta description: "{Mobile }windshield {work} in {city}, {state}." and
 * then the shop's strongest facts while it fits 155 — the same builder every
 * page type uses (lib/meta-description.ts), which is where the rules about
 * what may be said live: the network only behind the badge's gate, the rating
 * only from the live feed, no warranty name and no timing promise.
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
  const lead = `${input.mobile ? 'Mobile windshield' : 'Windshield'} ${input.work} in ${input.area}, ${input.state}`
  return siteDescription(lead, { networkLabel: input.networkLabel, mobile: input.mobile, rating: input.rating, phone: input.phone })
}
