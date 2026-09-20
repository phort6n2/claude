import {
  insuranceForState,
  insurerNoun,
  stateNameFor,
  CHIP_REPAIRABLE_NOTE,
  PUBLIC_INSURERS,
  type PublicInsurer,
} from '@/lib/insurance-rules'

/**
 * A LANDING PAGE ABOUT THE CLAIM, because "do you take insurance" is the
 * search, the ad group and the objection — and until now it was a band
 * two-thirds of the way down a page about windshields.
 *
 * TWO KINDS OF PAGE, ONE MECHANISM.
 *
 * 1. A NAMED PUBLIC INSURER (`icbc`, `sgi`, `mpi`). Canada's provincial auto
 *    insurers are public monopolies with trademarked names, and a shop
 *    advertising "ICBC windshield repair" is naming somebody else's trademark
 *    in ad copy. The carve-out that makes that lawful turns on the LANDING
 *    PAGE being primarily about the trademarked service — so an ICBC ad group
 *    pointed at a general auto glass page is the ad text hanging on nothing.
 *    Found on a live account: all seven of AGS's enabled ICBC ads had
 *    `final_urls: ["https://glassbc.com/"]`, the bare home page, while three
 *    of the ad groups were named ICBC, Insurance and Glass Express.
 *
 * 2. THE GENERAL CLAIMS PAGE (`general`), for the other fourteen shops. Same
 *    shell, same form, same tracked number, and its body is the per-state
 *    deductible rule out of `insurance-rules.ts` — copy that is ALREADY
 *    compliance-reviewed and already renders on every site. It needs nothing
 *    typed to be complete, which is the whole reason it can exist for fifteen
 *    shops: the lesson of the story sections is that a box an operator has to
 *    fill stays empty.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS ALLOWED TO SAY
 * ---------------------------------------------------------------------------
 * For a named insurer: almost nothing, and that is the design rather than a
 * gap in it.
 *
 * § 2 forbids inventing a fact about a business and forbids "approved by" and
 * "preferred provider" claims about insurers. The facts a page like this
 * wants — what the programme covers, what the deductible is, whether a claim
 * moves a premium, how long an authorisation lasts — are facts about the
 * INSURER, and they are exactly the kind a model answers fluently and wrongly.
 * They also change. So:
 *
 *   - The CATALOGUE below holds names only: what the insurer is called, which
 *     province it covers, and the address the page lives at. A name is not a
 *     policy claim.
 *   - The STRUCTURAL copy — how a claim works with US, what to have ready — is
 *     about this platform's own process and the documents any claim needs. It
 *     is gated on the same per-shop flags the rest of the template is.
 *   - Coverage for a NAMED insurer is TYPED BY AN OPERATOR and strips itself
 *     when empty, the same rule `Client.marketArea` follows: a claim about
 *     coverage is typed by a person and never inferred. Coverage on the
 *     general page comes from `insurance-rules.ts`, which is reviewed.
 *
 * `networkName` is null for every programme whose network this platform has
 * not confirmed the name of. A membership claim with no name for the thing
 * being joined is unfalsifiable, so a shop with `inNetwork` set on such a
 * programme renders NOTHING about it rather than a hedge.
 */

/** The pages this platform knows how to build. */
export type ProgramKey = 'general' | 'icbc' | 'sgi' | 'mpi'

export interface InsuranceProgram {
  key: ProgramKey
  /** What a driver calls it. Used in headlines and body copy. */
  short: string
  /** The full legal name, or null on the general page, which names no one. */
  full: string | null
  /** Province code this programme covers, or null for the general page. */
  province: string | null
  /**
   * The address the page lives at. FLAT, like every other page here — a shop's
   * old site and their ads use root-level addresses, and the whole point of
   * this page is that an ad can point at it.
   */
  slug: string
  /**
   * What the insurer calls its repair network, or null when this platform has
   * not confirmed the name. Null means a shop's `inNetwork` tick renders
   * nothing: see the note at the top.
   */
  networkName: string | null
  /**
   * What being in that network CHANGES for the driver, or null.
   *
   * The tick's whole value to somebody reading the page is this sentence, not
   * the badge — "we can do the claim without you ringing them" is the reason
   * to book here rather than anywhere. It is gated on the tick because it is
   * only true at such a shop, and it stays null until sourced, for the same
   * reason `networkName` does.
   */
  networkProcessLine: string | null
  /** True when the page's coverage copy has to be typed by an operator. */
  needsTypedCoverage: boolean
}

/**
 * Names come from `PUBLIC_INSURERS`, never from a second list here.
 *
 * `insurance-rules.ts` is the leaf and already had to know who insures a
 * driver in British Columbia — the insurance band, the hero cost line and the
 * default FAQ all ask it. A catalogue that restated the names would be the
 * copy that drifts, and the drift would show up as one page calling it ICBC
 * and another calling it "your carrier".
 */
function named(
  insurer: PublicInsurer,
  extra: Pick<InsuranceProgram, 'key' | 'slug' | 'networkName' | 'networkProcessLine'>
): InsuranceProgram {
  return {
    short: insurer.short,
    full: insurer.full,
    province: insurer.province,
    needsTypedCoverage: true,
    ...extra,
  }
}

export const INSURANCE_PROGRAMS: Record<ProgramKey, InsuranceProgram> = {
  general: {
    key: 'general',
    short: 'insurance',
    full: null,
    province: null,
    slug: 'insurance-glass-claims',
    networkName: null,
    networkProcessLine: null,
    // Its coverage copy is the reviewed per-state rule. Nothing to type.
    needsTypedCoverage: false,
  },
  // Confirmed against the shop's own published ICBC page and with the
  // operator, for this one programme. The others stay null until somebody
  // confirms them the same way — see the top of this file.
  icbc: named(PUBLIC_INSURERS.BC, {
    key: 'icbc',
    slug: 'icbc-glass-claims',
    networkName: 'the ICBC Repair Network',
    networkProcessLine:
      'If only the glass is damaged and there is no other body damage, you do not need to contact ICBC yourself — we can submit the claim for you and deal with the paperwork.',
  }),
  sgi: named(PUBLIC_INSURERS.SK, {
    key: 'sgi',
    slug: 'sgi-glass-claims',
    networkName: null,
    networkProcessLine: null,
  }),
  mpi: named(PUBLIC_INSURERS.MB, {
    key: 'mpi',
    slug: 'mpi-glass-claims',
    networkName: null,
    networkProcessLine: null,
  }),
}

export const PROGRAM_KEYS = Object.keys(INSURANCE_PROGRAMS) as ProgramKey[]

/** The programme for a key, or null when it is not one we know. */
export function programFor(key: string | null | undefined): InsuranceProgram | null {
  const k = String(key || '').trim().toLowerCase()
  return (INSURANCE_PROGRAMS as Record<string, InsuranceProgram>)[k] || null
}

/** The programme whose page lives at this flat address, or null. */
export function programForPath(bare: string): InsuranceProgram | null {
  const clean = String(bare || '').replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!clean || clean.includes('/')) return null
  return PROGRAM_KEYS.map((k) => INSURANCE_PROGRAMS[k]).find((p) => p.slug === clean) || null
}

/** Every address a programme page could occupy, for the reserved-path checks. */
export const PROGRAM_PATHS = PROGRAM_KEYS.map((k) => `/${INSURANCE_PROGRAMS[k].slug}`)

/** Where one client's page lives, for links, the sitemap and the canonical. */
export function programPath(program: InsuranceProgram): string {
  return `/${program.slug}`
}

/**
 * The programme a shop in this province would use, or the general page.
 *
 * A SUGGESTION FOR THE PICKER, NEVER AN AUTOMATIC CHOICE. Which insurer a
 * shop actually advertises against is a business decision, and a named
 * programme carries claims an operator has to stand behind.
 */
export function suggestedProgram(state: string | null | undefined): InsuranceProgram {
  const code = String(state || '').trim().toUpperCase()
  const named = PROGRAM_KEYS.map((k) => INSURANCE_PROGRAMS[k]).find((p) => p.province === code)
  return named || INSURANCE_PROGRAMS.general
}

/** What an operator has filled in for one client. */
export interface ProgramRecord {
  programKey: string
  /** Operator-VERIFIED membership of the insurer's repair network. */
  inNetwork: boolean
  /** What the programme covers, in an operator's own words. */
  coverageNote: string | null
  /** The claim, step by step, typed by an operator. */
  claimSteps: string[]
  metaDescription: string | null
  publishedAt: Date | string | null
}

/** Whatever came out of the database, reduced to something renderable. */
export function readProgramRecord(row: unknown): ProgramRecord | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (!programFor(r.programKey as string)) return null
  return {
    programKey: String(r.programKey).trim().toLowerCase(),
    inNetwork: r.inNetwork === true,
    coverageNote:
      typeof r.coverageNote === 'string' && r.coverageNote.trim() ? r.coverageNote.trim() : null,
    claimSteps: readSteps(r.claimSteps),
    metaDescription:
      typeof r.metaDescription === 'string' && r.metaDescription.trim()
        ? r.metaDescription.trim()
        : null,
    publishedAt: (r.publishedAt as Date | string | null) ?? null,
  }
}

export const MAX_STEPS = 8

export function readSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .slice(0, MAX_STEPS)
}

/**
 * Why this record cannot be published yet, or null when it can.
 *
 * A PUBLISHED PAGE IS THE AD'S DESTINATION, so an empty one is worse than no
 * page at all: the ad keeps running, the click still costs money, and the page
 * it lands on is the generic shell with a programme name in the H1 — which is
 * the exact thing this page type exists to stop being true.
 *
 * THE GENERAL PAGE HAS NO SUCH GATE, and that difference is the point. Its
 * body is the reviewed per-state rule, which is present for every state
 * (`insuranceForState` falls through to the standard answer rather than to
 * nothing), so it is complete the moment it is switched on. A named insurer's
 * page has nothing of its own until somebody types it.
 */
export function publishProblem(record: ProgramRecord): string | null {
  const program = programFor(record.programKey)
  if (!program) return 'Pick a page first.'
  if (record.claimSteps.length === 1) {
    return 'One step is not a process. Write the whole sequence, or leave the steps empty.'
  }
  if (!program.needsTypedCoverage) return null
  if (!record.coverageNote && record.claimSteps.length === 0) {
    return `Nothing here is about ${program.short} yet. Write what the claim covers, or the steps, before publishing — otherwise this is the ordinary page with a different headline on it, which is what the page exists to avoid.`
  }
  return null
}

/** True when this page may be linked, listed in the sitemap and indexed. */
export function programIsPublished(record: ProgramRecord | null): boolean {
  return !!record?.publishedAt && !publishProblem(record)
}

// ---------------------------------------------------------------------------
// Copy. Everything below is structural, reviewed, or operator-typed.
// ---------------------------------------------------------------------------

export interface ProgramCopyContext {
  businessName: string
  /** Headline area — never the address. See lib/site-area.ts. */
  area: string
  /** `Client.state`, for the reviewed per-state rule on the general page. */
  state: string | null
  /** `Client.filesInsuranceClaims`. */
  filesClaims: boolean
  /** `Client.offersMobileService`. */
  mobile: boolean
}

export interface ProgramSection {
  heading: string
  body: string
}

export function programTitle(program: InsuranceProgram, ctx: ProgramCopyContext): string {
  if (program.key === 'general') return `Insurance glass claims in ${ctx.area}`
  return `${program.short} glass claims in ${ctx.area}`
}

export function programHeroLine(program: InsuranceProgram): string {
  // No timing promise, no coverage claim, no cost. It says what the page is.
  if (program.key === 'general') {
    return 'Chipped or cracked glass and going through insurance? This page covers what your policy usually pays for, what we do with your carrier, and how to book.'
  }
  return `Chipped or cracked glass and going through ${program.short}? This page covers how the claim works with us, what to have ready, and how to book.`
}

/**
 * The page's own sections, in reading order.
 *
 * Coverage leads, because it is the part that is actually about the claim —
 * and the page's whole licence to be a separate page (and, for a named
 * insurer, to use the trademark at all) is that it is primarily about that.
 * The structural sections follow.
 *
 * EVERY SECTION STRIPS ITSELF WHEN ITS DATA IS EMPTY, so an untouched record
 * produces a shorter page and never a broken one.
 */
export function programSections(
  program: InsuranceProgram,
  record: ProgramRecord,
  ctx: ProgramCopyContext
): ProgramSection[] {
  const sections: ProgramSection[] = []

  const coverage = coverageBody(program, record, ctx)
  if (coverage) {
    sections.push({
      heading:
        program.key === 'general'
          ? coverageHeading(ctx.state)
          : `What ${program.short} covers`,
      body: coverage,
    })
  }

  sections.push({
    heading: 'Making the claim with us',
    body: [
      claimHandlingLine(program, ctx),
      networkSentence(program, record, ctx),
      ctx.mobile
        ? 'We come to you — home, work or roadside — so the claim does not cost you a day off.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  })

  sections.push({
    heading: 'What to have ready',
    // Deliberately about DOCUMENTS, not about the policy. Every one of these
    // is something the driver has in their hand and is true of any claim; none
    // of it states what the programme pays for.
    body: [
      'It goes faster if you have these to hand when you call or fill in the form:',
      `Your driver's licence, the vehicle's plate number, where and when the damage happened, and a photo of the damage if you can get one. If ${claimNumberHolder(program, ctx)} has already given you a claim number, have that too.`,
      `Not sure whether it is a repair or a replacement? Send the photo with your quote request and we will tell you. ${CHIP_REPAIRABLE_NOTE}`,
    ].join('\n\n'),
  })

  return sections
}

/** The coverage paragraph, reviewed or typed depending on the page. */
export function coverageBody(
  program: InsuranceProgram,
  record: ProgramRecord,
  ctx: ProgramCopyContext
): string {
  // A named insurer's coverage is a fact about that insurer. Nothing here
  // knows it, so an empty note means the section is simply not rendered.
  if (program.needsTypedCoverage) return record.coverageNote || ''
  // The general page's is the reviewed per-state rule — the same copy the
  // insurance band prints, which is why there is no second version of it.
  const rule = insuranceForState(ctx.state)
  return [rule.summary, rule.note || ''].filter(Boolean).join('\n\n')
}

function coverageHeading(state: string | null | undefined): string {
  const name = stateNameFor(state)
  return name ? `What your policy covers in ${name}` : 'What your policy covers'
}

/**
 * Who the driver would have got a claim number from.
 *
 * The GENERAL page still names the real insurer in a public-insurer province:
 * a BC shop that uses the general page rather than the ICBC one must not tell
 * its readers to ring "your carrier". Same rule, same table — see
 * `insurerNoun` in insurance-rules.ts.
 */
function claimNumberHolder(program: InsuranceProgram, ctx: ProgramCopyContext): string {
  return program.key === 'general' ? insurerNoun(ctx.state) : program.short
}

/** Gated on `filesInsuranceClaims`, exactly as the insurance band is. */
function claimHandlingLine(program: InsuranceProgram, ctx: ProgramCopyContext): string {
  const who = claimNumberHolder(program, ctx)
  return ctx.filesClaims
    ? `We deal with ${who} directly. Give us your claim details and we handle the paperwork from there, so you are not on the phone about it.`
    : `We will check your coverage with you before you commit to anything, and give ${who} everything they need from our side: the exact glass, the part numbers and a written quote.`
}

/**
 * The membership sentence, or ''.
 *
 * MEMBERSHIP, NEVER ENDORSEMENT. § 2 forbids "approved by" and "preferred
 * provider" claims about insurers, and the difference is real: taking part in
 * a published network is a fact a shop can prove, while being preferred is a
 * claim about how the insurer ranks them. So this says what the shop is part
 * of and stops there — and the disclaimer under the insurance band changes to
 * match, because a page that claims a network in one paragraph and denies any
 * affiliation in the next is a page that contradicts itself in front of the
 * customer it is trying to convince.
 */
export function networkSentence(
  program: InsuranceProgram,
  record: ProgramRecord,
  ctx: ProgramCopyContext
): string {
  if (!record.inNetwork || !program.networkName) return ''
  return [`${ctx.businessName} is part of ${program.networkName}.`, program.networkProcessLine]
    .filter(Boolean)
    .join(' ')
}

/**
 * The affiliation line under the insurance band.
 *
 * The standard one ends "not affiliated with or endorsed by any insurance
 * company", which is true for fourteen of fifteen shops and flatly untrue on
 * a site that has just said the shop is in an insurer's repair network. The
 * network variant keeps the part that matters — the driver's statutory choice
 * of shop — and drops the sentence the page itself disproves.
 */
export function affiliationLine(
  program: InsuranceProgram | null,
  record: ProgramRecord | null
): string {
  if (program && record?.inNetwork && program.networkName) {
    return `We are an independent auto glass company that takes part in ${program.networkName}. That is not an endorsement of us over any other shop — your choice of repair shop is yours to make.`
  }
  return 'We are an independent auto glass company and are not affiliated with or endorsed by any insurance company. Your choice of repair shop is yours to make.'
}

/** The meta description, when the operator has not written one. */
export function programDescription(
  program: InsuranceProgram,
  record: ProgramRecord,
  ctx: ProgramCopyContext
): string {
  if (record.metaDescription) return record.metaDescription
  const who = program.key === 'general' ? 'an insurance' : `a ${program.short}`
  return `How ${who} glass claim works with ${ctx.businessName} in ${ctx.area}: what to have ready, what we do with your carrier, and how to book. Free quotes.`
}
