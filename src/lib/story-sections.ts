import { SERVICE_PAGES, type ServiceFlag } from '@/lib/site-services'

/**
 * Drafts the story sections for a shop whose old site had none to import.
 *
 * WHY THIS EXISTS. The story sections are the long-form middle of the site and
 * the importer is the only thing that has ever filled them, so a shop with no
 * previous website — or one whose site was a single page of stock photos —
 * lands on the Website tab looking at an empty box and a "+ Add section"
 * button. Nothing gets typed, and the site ships as hero → services with
 * nothing in between.
 *
 * WHY IT IS THE RISKIEST BUTTON IN THE ADMIN. §2's first rule is never invent
 * a fact about a business, and "write the story of this auto glass shop" is a
 * request a model answers fluently and wrongly: years in business, a family
 * founding, certifications, same-day service, a preferred-provider
 * relationship with an insurer. Every one of those reads perfectly and is a
 * claim on a real business's behalf in a regulated trade.
 *
 * So this module is built like `nearby-cities.ts` rather than like a
 * generator: THE MODEL IS A SOURCE OF PROSE, NOT OF FACTS.
 *
 * - The prompt carries the facts this app actually holds, and says they are
 *   the only ones that exist.
 * - Every section that comes back is SCREENED against the claims it is not
 *   allowed to make, and a section that trips the screen is DROPPED — not
 *   edited down, not flagged and kept. The note says which one went and what
 *   tripped it, so a screen that fires reads as the tool working rather than
 *   as the button failing.
 * - The screen is GATED ON THE SAME FLAGS THE TEMPLATE IS. A draft that says
 *   "we come to you" for a shop with no mobile unit, or "we handle the claim"
 *   for a shop whose `filesInsuranceClaims` is off, is the exact claim those
 *   flags exist to prevent — and it would arrive in a field no flag guards.
 * - A service the shop does not offer is screened by keyword too: the
 *   services grid strips itself, but a paragraph mentioning sunroof glass
 *   does not.
 *
 * WHAT IT DELIBERATELY WILL NOT WRITE.
 *
 * - THEIR HISTORY. It is the first thing the field asks for and nothing here
 *   knows it. The UI says so rather than letting the button imply otherwise.
 * - INSURANCE AND COST. The site already has a band for both, built from
 *   `insurance-rules.ts`, which is compliance-reviewed per state. A story
 *   section covering the same ground is a second, unreviewed version of the
 *   same claim — so the screen treats any mention of a deductible, a price or
 *   an insurer as disqualifying rather than as a topic.
 * - THE WARRANTY. Same reason, plus §2: a named warranty must state its
 *   terms, and "backed by our warranty" in the middle of a story is that
 *   failure exactly. The warranty band is where those terms live.
 *
 * Pure: facts in, a prompt out, and a screen over what comes back. No fetch,
 * no database, no model call — so `scripts/check-story-sections.ts` can assert
 * every rule without credentials.
 */

/**
 * Three, not five. The page order puts these between the hero and the
 * services grid, and this is the one part of the draft that is a judgement
 * rather than a fact: a paid visitor scrolling for "what will this cost me"
 * should not pass five blocks of prose first. The operator can add more.
 */
export const MAX_DRAFT_SECTIONS = 3

export interface StoryInput {
  businessName: string
  city: string
  state: string
  /** What the headlines call the area. Empty means the city — see site-area.ts. */
  marketArea: string | null
  hasShopLocation: boolean
  offersMobileService: boolean
  filesInsuranceClaims: boolean
  smsCapable: boolean
  /** Every service flag, so the screen can police the ones that are OFF. */
  services: Record<ServiceFlag, boolean>
  serviceAreas: string[]
  /** Their own words already on the site, to match voice and avoid repeating. */
  existingVoice: string[]
}

export interface StoryDraft {
  heading: string
  body: string
  /** Always empty: a section with no photo falls back to the gallery. */
  photoUrl: string
}

export interface StoryScreenResult {
  kept: StoryDraft[]
  /** What was thrown away and the exact words that did it. */
  dropped: Array<{ heading: string; reason: string }>
}

/** The service names this shop actually offers, in the site's own wording. */
export function offeredServices(services: Record<ServiceFlag, boolean>): string[] {
  return SERVICE_PAGES.filter((s) => services[s.flag]).map((s) => s.name.toLowerCase())
}

/** How the site's own headlines name this shop's patch. */
export function areaName(input: Pick<StoryInput, 'marketArea' | 'city' | 'state'>): string {
  return input.marketArea?.trim() || `${input.city}, ${input.state}`
}

/**
 * Everything the draft is allowed to be built from, as the prompt states it.
 *
 * Every line is either operator-entered on the Business tab or a flag the
 * template already gates a claim on. Nothing is inferred: an absent fact stays
 * absent, because the model cannot ask and must not guess.
 */
export function storyFacts(input: StoryInput): string[] {
  const offered = offeredServices(input.services)
  const missing = SERVICE_PAGES.filter((s) => !input.services[s.flag]).map((s) =>
    s.name.toLowerCase()
  )
  return [
    `Business name: ${input.businessName}`,
    `Where the shop sits: ${input.city}, ${input.state}`,
    `What the site's headlines call the area it covers: ${areaName(input)}`,
    `Work they do: ${offered.join(', ') || 'auto glass'}`,
    missing.length ? `Work they do NOT do, and must not be mentioned: ${missing.join(', ')}` : '',
    input.offersMobileService
      ? 'They run a mobile unit that travels to the customer.'
      : 'NO mobile service. The customer comes to the shop. Never imply otherwise.',
    input.hasShopLocation
      ? 'They have a shop a customer can come to.'
      : 'NO premises a customer visits. Never mention a shop, a waiting room or coming in.',
    input.filesInsuranceClaims
      ? 'They deal with the insurance carrier directly on the customer’s behalf.'
      : 'They do NOT file claims for the customer. Never say they handle, file or submit a claim.',
    input.smsCapable
      ? 'Their number can receive text messages.'
      : 'Their number CANNOT receive texts. Never invite anyone to text a photo.',
    input.serviceAreas.length
      ? `Towns and cities listed as covered: ${input.serviceAreas.join(', ')}`
      : 'No individual towns are listed.',
  ].filter(Boolean)
}

export function storyPrompt(input: StoryInput): string {
  const area = areaName(input)
  const voice = input.existingVoice.filter(Boolean).join('\n\n').slice(0, 2000)

  return `You are drafting the middle sections of a local auto glass shop's website. A human operator reads every word before it is published, and anything that makes a claim we cannot back is thrown away automatically.

WHAT YOU KNOW ABOUT THIS BUSINESS. This is everything. There is no other source, and you cannot ask.
${storyFacts(input).join('\n')}

${voice ? `THEIR OWN WORDS ELSEWHERE ON THE SITE — match this voice, do not repeat it:\n${voice}\n` : ''}
WHAT THESE SECTIONS ARE FOR
They sit between the hero and the services grid, read by somebody who has just arrived with a cracked windshield. Write ${MAX_DRAFT_SECTIONS} sections, in this order, from this list:
1. The range of glass work they take on — built ONLY from the list above.
2. How the job goes, in general terms: what you tell them, what they do, what the glass has to do afterwards. NO timings.
3. ${input.offersMobileService ? `Where they work — ${area}, and the mobile unit coming to the customer.` : `Where they work — ${area}, and what that covers.`}

HARD RULES. These come from advertising-compliance review for a regulated trade, not from style. Breaking one throws the whole section away.
- INVENT NO FACT about this business. Not years in business, not when it started, not who founded it, not family ownership, not staff or van counts, not certifications or training, not the glass brands they stock, not how many jobs they have done.
- NO TIMING of any kind. No "same day", no "within an hour", no "24/7", no minutes or hours, not "fast" and not "quickly". This platform cannot promise scheduling on a shop's behalf.
- NO PRICES, no "free", no "affordable", no discounts, and NEVER the word deductible. The site has its own cost section, written and reviewed separately.
- NO INSURER NAMED, ever, and no relationship with one: no "approved", no "preferred provider", no "in network".
- NO WARRANTY mentioned. The site has a warranty band that states the actual terms; a warranty named here without its terms is the thing that band exists to prevent.
- NO RATINGS, review counts, star claims, "top rated", "#1", "best", and no customer quotes. Ratings come from a live Google feed or not at all.
- NO OEM or "original equipment" claim, nothing about what is in stock, and not "all makes and models".
- Write as the shop ("we"), plainly. A cracked windshield is a bad afternoon for the reader; be useful, not triumphant. No "nestled in the heart of", no "state-of-the-art".
- You MAY write freely about the TRADE and about GLASS — why a windshield is structural, what a chip does if it is left, what the adhesive needs, what the weather and the roads do to glass. That is public knowledge, not a claim about this business, and it is where the substance should come from.

LENGTH: each section 70–130 words, one or two short paragraphs. Headings under 60 characters, plain, no colons.

Return ONLY a JSON array, no other text:
[{"heading": "...", "body": "..."}]`
}

/** A claim nothing in this app can back, and the words that give it away. */
interface Rule {
  /** Said back to the operator, so a drop explains itself. */
  reason: string
  patterns: RegExp[]
}

const INSURERS =
  /\b(state farm|geico|progressive|allstate|usaa|farmers|liberty mutual|nationwide|travelers|american family|safeco|esurance|mercury insurance)\b/i

/**
 * The universal screen. Every one of these is a claim that reads perfectly and
 * is nobody's to make here — which is exactly why a human skimming a fluent
 * draft waves them through.
 */
const RULES: Rule[] = [
  {
    reason: 'claims how long they have been in business',
    patterns: [
      /\b(since|established|est\.)\s*(19|20)\d{2}\b/i,
      /\b\d+\+?\s*(years|decades)\b/i,
      /\b(decades|generations)\b/i,
      /\byears of (experience|service)\b/i,
      /\b(family|veteran|women|woman|locally)[- ]owned\b/i,
      /\b(second|third|fourth)[- ]generation\b/i,
    ],
  },
  {
    reason: 'promises a timeframe',
    patterns: [
      /\bsame[- ]day\b/i,
      /\bnext[- ]day\b/i,
      /\b24[/\- ]?7\b/i,
      /\baround the clock\b/i,
      /\bwithin (an?|\d+)\s*(hour|minute|day)/i,
      /\b\d+\s*(minutes|hours)\b/i,
      /\bin (minutes|under an hour)\b/i,
      /\b(quickly|fast|prompt|promptly|speedy|right away|immediately)\b/i,
      /\bwhile you wait\b/i,
    ],
  },
  {
    reason: 'talks about price or cost',
    patterns: [
      /\$\s?\d/,
      /\bdeductible\b/i,
      /\bfree\b/i,
      /\b(no|zero) (charge|cost|out[- ]of[- ]pocket)\b/i,
      /\b(affordable|cheap|lowest price|best price|beat any|discount)/i,
      /\bwaiv(e|ed|ing)\b/i,
    ],
  },
  {
    reason: 'names an insurer or claims a relationship with one',
    patterns: [
      INSURERS,
      /\bpreferred (provider|shop|partner|installer)\b/i,
      /\bapproved by\b/i,
      /\bin[- ]network\b/i,
      /\bdirect bill/i,
    ],
  },
  {
    reason: 'says they handle the insurance claim',
    // Unconditional: the shop that DOES deal with the carrier has that
    // sentence already, in the compliance-reviewed insurance band.
    patterns: [/\b(handle|file|submit|take care of|manage)\b[^.]{0,20}\bclaim/i],
  },
  {
    reason: 'claims a certification or training',
    patterns: [
      /\bcertif(ied|ication)\b/i,
      /\bAGSC\b/,
      /\bAGRSS\b/,
      /\bI-?CAR\b/i,
      /\b(licensed|accredited)\b/i,
      // NOT a bare "bonded": that is what a windshield IS — bonded into the
      // body — and it is the single most useful sentence the page can carry.
      // The claim is the tradesman's boilerplate pairing, so match the pair.
      /\b(licensed and bonded|bonded and insured)\b/i,
      /\b(factory|manufacturer|master)[- ]trained\b/i,
    ],
  },
  {
    reason: 'mentions a warranty, which belongs in the warranty band with its terms',
    patterns: [/\bwarrant(y|ies|ied)\b/i, /\bguarantee/i, /\blifetime\b/i],
  },
  {
    reason: 'makes a claim about ratings, reviews or being the best',
    patterns: [
      /\b(five|5)[- ]star\b/i,
      /\b(top|highest|best)[- ]rated\b/i,
      /\b#\s?1\b/,
      /\bnumber one\b/i,
      /\bbest in\b/i,
      /\b(hundreds|thousands) of\b/i,
      /\b\d+\s*(reviews|customers|vehicles|jobs|windshields)\b/i,
    ],
  },
  {
    reason: 'reads as a customer quote',
    // A fabricated testimonial is the §2 example that needs no argument. Long
    // enough to be a sentence; a quoted term of art is not caught.
    patterns: [/["“][^"”]{25,}["”]/],
  },
  {
    reason: 'claims staff, vehicles or premises nobody stated',
    patterns: [
      /\bour team of\b/i,
      /\b\d+\s*(technicians|installers|techs|trucks|vans|bays|locations)\b/i,
    ],
  },
  {
    reason: 'claims what glass they use or stock',
    patterns: [
      /\bOEM\b/,
      /\boriginal equipment\b/i,
      /\b(in stock|we stock|fully stocked)\b/i,
      /\ball makes and models\b/i,
      /\bany (make|model)\b/i,
    ],
  },
]

/**
 * The gated screen: claims that are true for SOME shops on this platform, and
 * are a lie for the rest. These are the per-shop flags from §2, enforced here
 * because the story field is free text that no flag guards at render time.
 */
function gatedRules(input: StoryInput): Rule[] {
  const rules: Rule[] = []
  if (!input.offersMobileService) {
    rules.push({
      reason: 'says they come to the customer, and mobile service is off for this shop',
      patterns: [
        /\bmobile\b/i,
        /\bwe (come|travel|drive) to (you|your)\b/i,
        /\b(at your|to your) (home|office|driveway|workplace)\b/i,
        /\bon[- ]site\b/i,
      ],
    })
  }
  if (!input.hasShopLocation) {
    rules.push({
      reason: 'points the customer at premises this shop does not have',
      patterns: [/\b(our|the) (shop|garage|facility|workshop|premises)\b/i, /\bcome (in|by|down)\b/i, /\bwaiting (room|area)\b/i, /\bdrop (it|the car|your car) off\b/i],
    })
  }
  if (!input.smsCapable) {
    rules.push({
      reason: 'invites a text message to a number that cannot receive one',
      patterns: [/\btext (us|me|a photo|the)\b/i, /\bsend (us )?a (text|photo)\b/i, /\bby text\b/i],
    })
  }

  // A service that is off strips its own card out of the services grid. A
  // paragraph mentioning it does not strip anything — it simply advertises
  // work the shop does not do, and the first call about it is somebody's
  // wasted afternoon.
  const byFlag: Array<[ServiceFlag, RegExp[]]> = [
    ['offersWindshieldReplacement', [/\bwindshield replacement\b/i, /\breplac\w* (the |your |a )?windshield\b/i]],
    ['offersWindshieldRepair', [/\bwindshield repair\b/i, /\brepair\w* (the |your |a )?windshield\b/i]],
    ['offersSideWindowRepair', [/\b(side|door|quarter|vent) (window|glass)\b/i]],
    ['offersBackWindowRepair', [/\b(back|rear) (glass|window|windshield)\b/i]],
    ['offersSunroofRepair', [/\b(sunroof|moonroof)\b/i]],
    // No leading \b on calibrat: "recalibration" is the word that actually
    // turns up, and an anchored pattern misses it entirely.
    ['offersAdasCalibration', [/calibrat/i, /\bADAS\b/i, /\bdriver[- ]assist/i, /\blane[- ]keep/i]],
  ]
  for (const [flag, patterns] of byFlag) {
    if (input.services[flag]) continue
    const name = SERVICE_PAGES.find((s) => s.flag === flag)?.name.toLowerCase() || flag
    rules.push({ reason: `mentions ${name}, which this shop does not offer`, patterns })
  }

  // CHIPS ARE TWO FLAGS FOR ONE JOB. "Rock chip repair" and "windshield
  // repair" are the same resin injection under two names, and most shops have
  // both on. Screening the word on either flag alone would throw away the
  // best paragraph in the draft — what a chip does if it is left is the most
  // useful thing the page can tell somebody — over a distinction the shop
  // does not make itself. So it is only a forbidden word when neither is on.
  if (!input.services.offersRockChipRepair && !input.services.offersWindshieldRepair) {
    rules.push({
      reason: 'mentions chip repair, which this shop does not offer',
      patterns: [/\b(rock )?chips?\b/i],
    })
  }

  return rules
}

/**
 * Keep only the sections that claim nothing this app cannot back.
 *
 * DROPPED, never trimmed. A half-edited paragraph is a sentence nobody wrote
 * and nobody reviewed, and the operator can no longer tell which half came
 * from a model. A missing section is obvious and fixable; a quietly doctored
 * one is neither.
 */
export function screenStory(
  sections: Array<{ heading?: unknown; body?: unknown; photoUrl?: unknown }>,
  input: StoryInput
): StoryScreenResult {
  const rules = [...RULES, ...gatedRules(input)]
  const kept: StoryDraft[] = []
  const dropped: Array<{ heading: string; reason: string }> = []
  const seen = new Set<string>()

  for (const raw of sections) {
    const heading = typeof raw.heading === 'string' ? raw.heading.trim() : ''
    const body = typeof raw.body === 'string' ? raw.body.trim() : ''
    // asChapters drops these anyway; caught here so the count adds up.
    if (!heading || !body) {
      dropped.push({ heading: heading || '(no heading)', reason: 'came back empty' })
      continue
    }

    const text = `${heading}\n${body}`
    let tripped: { reason: string; match: string } | null = null
    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        const hit = text.match(pattern)
        if (hit) {
          tripped = { reason: rule.reason, match: hit[0] }
          break
        }
      }
      if (tripped) break
    }
    if (tripped) {
      dropped.push({ heading, reason: `${tripped.reason} (“${tripped.match.trim()}”)` })
      continue
    }

    const key = heading.toLowerCase()
    if (seen.has(key)) {
      dropped.push({ heading, reason: 'repeats a heading already drafted' })
      continue
    }
    seen.add(key)
    kept.push({ heading: heading.slice(0, 80), body, photoUrl: '' })
    if (kept.length >= MAX_DRAFT_SECTIONS) break
  }

  return { kept, dropped }
}
