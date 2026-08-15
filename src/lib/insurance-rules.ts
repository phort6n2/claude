/**
 * What a driver's glass deductible actually looks like, state by state.
 *
 * This exists because it is the single most expensive question in the trade.
 * One shop owner measured 80–100 minutes a day re-explaining it on the phone.
 * The customer's real question is never "do you take insurance" — it is "what
 * is this going to cost me", and until that is answered they do not book.
 *
 * ---------------------------------------------------------------------------
 * Why the copy is hedged the way it is
 * ---------------------------------------------------------------------------
 * This text goes on fifteen real businesses' websites. Getting it wrong is
 * not an SEO problem, it is a consumer-protection one, and the shop wears it.
 * So three rules hold throughout:
 *
 *   1. Every statement is conditioned on the driver CARRYING COMPREHENSIVE.
 *      None of these laws give anyone free glass. They govern the deductible
 *      on a policy the driver already pays for — South Carolina's own DOI
 *      publishes a FAQ headed "There is no 'free' glass coverage in South
 *      Carolina" for exactly this reason.
 *   2. The word "free" never appears. Florida in particular has a history of
 *      assignment-of-benefits abuse around windshields, and "free windshield"
 *      advertising is what drew the regulator's attention.
 *   3. Every state ends by pointing at the carrier. We are not the driver's
 *      insurer and cannot read their policy.
 *
 * Aggregator sites disagree with each other on this — one widely-cited table
 * lists Arizona as an automatic waiver and South Carolina as windshield-only,
 * and both are wrong. Arizona's A.R.S. §20-264 requires insurers to OFFER the
 * zero-deductible option; the driver has to have elected it. South Carolina's
 * §38-77-280 covers safety glass generally, not just the windshield. Anything
 * added here should be checked against the statute or the state DOI, not
 * against another glass shop's blog.
 */

export type GlassDeductibleRule =
  /** Statute removes the deductible outright on a comprehensive policy. */
  | 'automatic'
  /** Insurers must offer a zero-deductible glass option; the driver elects it. */
  | 'optional'
  /** No special rule — the ordinary comprehensive deductible applies. */
  | 'standard'

export interface StateInsuranceRule {
  rule: GlassDeductibleRule
  /** Headline answer, written for the driver. */
  summary: string
  /** Anything else true in this state worth knowing before they call. */
  note?: string
}

/**
 * Only the states with a rule of their own are listed. Everywhere else falls
 * through to the standard answer, which is the honest one for most of the US.
 */
const STATE_RULES: Record<string, StateInsuranceRule> = {
  // --- Deductible removed by statute ---
  FL: {
    rule: 'automatic',
    summary:
      'Florida law says a comprehensive policy issued in this state cannot apply its deductible to windshield replacement. If you carry comprehensive, a windshield normally costs you nothing out of pocket.',
    note: 'That applies to the windshield specifically. Door glass and back glass go through your ordinary deductible.',
  },
  KY: {
    rule: 'automatic',
    summary:
      'Kentucky law removes the deductible from motor vehicle safety glass on a comprehensive policy — windshield, door and window glass alike. If you carry comprehensive, that usually means nothing out of pocket.',
    note: 'Kentucky updated the statute in 2024 to state plainly that ADAS recalibration is part of a glass replacement, so a camera recalibration is covered with the glass rather than billed to you separately.',
  },
  SC: {
    rule: 'automatic',
    summary:
      'South Carolina law does not allow a deductible on automobile safety glass under a physical-damage policy. If you carry comprehensive, glass normally costs you nothing out of pocket.',
    note: 'Worth being clear: this is coverage you already pay for in your premium, not a free windshield programme.',
  },

  // --- Insurers must offer it; the driver has to have taken it ---
  AZ: {
    rule: 'optional',
    summary:
      'Arizona requires insurers to offer zero-deductible glass coverage, but you have to have chosen it. Check whether your policy has the glass endorsement — if it does, a windshield usually costs you nothing.',
    note: 'Arizona also bars your insurer from raising your rate over a glass claim that was not your fault, so a rock chip on the freeway should not move your premium.',
  },
  CT: {
    rule: 'optional',
    summary:
      'Connecticut insurers offer a zero-deductible safety glass option for an extra premium. If you took it, a windshield usually costs you nothing; if not, your ordinary comprehensive deductible applies.',
  },
  MA: {
    rule: 'optional',
    summary:
      'Massachusetts policies can carry comprehensive with a zero-dollar glass deductible, but it is an option rather than the default. Check your policy before you assume either way.',
  },
  MN: {
    rule: 'optional',
    summary:
      'Minnesota policies commonly offer a zero-deductible glass option. If yours has it, a windshield usually costs you nothing out of pocket — worth checking before you book.',
  },
  NY: {
    rule: 'optional',
    summary:
      'New York insurers offer comprehensive with a zero-dollar glass deductible, but it is not automatic. Check whether your policy includes it.',
  },
}

const STANDARD: StateInsuranceRule = {
  rule: 'standard',
  summary:
    'Glass damage is covered under the comprehensive part of your policy, and your comprehensive deductible applies to a replacement.',
  note: 'Most carriers waive the deductible entirely for a chip repair, because a repair costs them a fraction of a replacement. If the damage is still repairable, that is usually the cheapest outcome for everyone.',
}

/**
 * The rule for a state, by two-letter code. Unknown or missing states get the
 * standard answer rather than nothing — a driver in a state without a special
 * law still needs the question answered.
 */
export function insuranceForState(state: string | null | undefined): StateInsuranceRule {
  const code = (state || '').trim().toUpperCase()
  return STATE_RULES[code] || STANDARD
}

/** True when this state's own law does the work, for a stronger headline. */
export function hasStatutoryWaiver(state: string | null | undefined): boolean {
  return insuranceForState(state).rule === 'automatic'
}

/**
 * The chip-repair point, split in two.
 *
 * The deductible half only makes sense where a deductible actually bites — in
 * Florida or South Carolina it reads as a worse version of what the state
 * card just said. The repairability half is true everywhere and is the single
 * most useful sentence on the page: it turns a "how much" call into a
 * booking, and it has a deadline built in.
 */
/**
 * One line, for above the fold.
 *
 * Cost is the first question a driver has and the page used to answer it in
 * section eight. This is the shortest true answer available without any
 * per-shop data: in the statutory-waiver states it names the law, and
 * everywhere else it points at the chip repair, which is the cheapest real
 * outcome. Both are conditioned on carrying comprehensive and neither
 * promises a price.
 */
export function heroCostLineFor(state: string | null | undefined): string {
  const rule = insuranceForState(state)
  const name = stateNameFor(state)
  if (rule.rule === 'automatic' && name) {
    return `In ${name}, a comprehensive policy can’t put a deductible on a windshield replacement — for most drivers that’s nothing out of pocket.`
  }
  return 'Most carriers waive the deductible entirely on a chip repair — if yours can still be repaired, that’s usually the cheapest way out.'
}

export const CHIP_DEDUCTIBLE_NOTE =
  'Most carriers waive the deductible on a chip repair even where a replacement would carry one — a repair costs them a fraction of new glass.'

export const CHIP_REPAIRABLE_NOTE =
  'Damage smaller than a dollar bill, out of the driver’s line of sight and away from the edge, can usually still be repaired — which is quicker, cheaper, and keeps the original factory seal. Once it spreads, it is a replacement, so it is worth calling early.'

/**
 * Two-letter code to full name, for copy that reads like a person wrote it.
 * "Glass claims in Florida", not "Glass claims in FL".
 */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington DC',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  // Canadian provinces — clients can be set to country CA.
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', ON: 'Ontario',
  PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan',
}

export function stateNameFor(state: string | null | undefined): string | null {
  const raw = (state || '').trim()
  if (!raw) return null
  // Already a full name (the admin form accepts either).
  if (raw.length > 2) return raw
  return STATE_NAMES[raw.toUpperCase()] || null
}

/** Heading for the state card, e.g. "Glass claims in Florida". */
export function insuranceHeadingFor(state: string | null | undefined): string {
  const name = stateNameFor(state)
  return name ? `Glass claims in ${name}` : 'Filing through insurance'
}
