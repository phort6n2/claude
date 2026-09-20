import { SERVICE_PAGES, type ServiceFlag } from '@/lib/site-services'
import { PHONE_RE } from '@/lib/rogue-numbers'
import { PREMISES_WORDS } from '@/lib/site-premises'

/**
 * THE CLAIMS A DRAFT IS NOT ALLOWED TO MAKE, in one place.
 *
 * Read the top of `story-sections.ts` first: this is the screen that makes
 * §2 a guarantee rather than an instruction, for every piece of copy a model
 * drafts on a real shop's behalf. It lives apart from the story drafter
 * because the FAQ drafter needs exactly the same rules, and two copies of a
 * compliance list is the one shape this codebase keeps refusing — the same
 * reason the intake has ONE field list and the upload formats live in ONE
 * module. A rule added for one drafter has to protect the other.
 *
 * There are two halves and the second is the harder one:
 *
 * - UNIVERSAL rules are claims nobody on this platform may make: years in
 *   business, timings, prices, insurer relationships, certifications,
 *   warranties, ratings, testimonials, staff counts, what glass is in stock,
 *   and what the law requires.
 * - GATED rules are claims that are TRUE for one shop here and false for the
 *   next, so they are decided by the same per-shop flags the template is
 *   gated on. A free-text field is where those claims escape: nothing guards
 *   it at render time the way the template guards itself.
 *
 * Pure: text and flags in, a problem or null out.
 */

/** Everything the gated half needs to know, and nothing else. */
export interface ClaimContext {
  hasShopLocation: boolean
  offersMobileService: boolean
  filesInsuranceClaims: boolean
  smsCapable: boolean
  services: Record<ServiceFlag, boolean>
}

/** What tripped, in words an operator can act on, and the words that did it. */
export interface ClaimProblem {
  reason: string
  match: string
}

/** A claim nothing in this app can back, and the words that give it away. */
export interface Rule {
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
      // "the" alongside "a/an/<number>": "within the hour" is the way people
      // actually write this one, and it slipped straight through.
      /\bwithin (an?|the|\d+)\s*(hour|minute|day)/i,
      /\b\d+\s*(minutes|hours)\b/i,
      /\bin (minutes|under an hour)\b/i,
      // NOT "immediately" or "right away", which were here and had to come
      // out. The most useful answer the FAQ can carry is "it is NOT safe to
      // drive immediately after a replacement, and here is what decides when
      // it is" — a refusal to promise, thrown away by a rule against
      // promising. Those two words appear in protective copy at least as
      // often as in a claim, and the specific nets above catch the claim.
      //
      // AND THE SPEED ADJECTIVES ARE NOT BARE EITHER, which the city pages
      // exposed: they are written about a PLACE, and "fast-moving traffic on
      // I-4" and "the surface deteriorates quickly" are facts about a road,
      // not promises about a shop. A bare /\bfast\b/ threw away the most
      // specific sentence on the page. So the word has to be attached to the
      // service or to us before it is a claim.
      /\b(quick|fast|speedy|prompt)(ly)?[- ]?(service|turnaround|repair|replacement|response|quote|appointment|fix|install(ation)?)\b/i,
      /\b(we|our|us)\b[^.!?]{0,34}\b(quickly|fast|promptly|speedy)\b/i,
      /\b(quickly|fast|promptly|speedy)\b[^.!?]{0,28}\b(back on the road|out the door|fitted|installed|replaced|repaired|booked|scheduled)\b/i,
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
    // THE ONE A FAQ INVITES. "Is it illegal to drive with a cracked
    // windshield?" is a question every glass customer asks and the answer is
    // state law, which varies, changes, and is not this platform's to state on
    // fifteen shops' behalf in fifteen jurisdictions. The only law copy on
    // these sites is the per-state glass deductible rule in
    // insurance-rules.ts, which has been compliance-reviewed.
    reason: 'states what the law or an inspection requires',
    patterns: [
      /\b(illegal|unlawful|against the law|law requires|required by law|legally required)\b/i,
      /\bfail(s|ed|ing)? (an? )?(safety )?inspection\b/i,
      /\b(ticket|citation|cited|fined|pulled over)\b/i,
      /\bstate law\b/i,
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
function gatedRules(input: ClaimContext): Rule[] {
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
    /* ONE LIST, shared with the template — the same reason `PHONE_RE` is
       imported from `rogue-numbers` above rather than written again here.
       This rule used to carry its own copy and it had drifted narrower than
       the one the site is screened against: no `store`, no `in-shop`, no
       `visit us`, no `this shop`, and — the one that mattered — no
       "bring it / bring the vehicle". A drafter could therefore write
       "Bring it to us while it's small" for a shop with nowhere to bring it
       to, and both screens would pass it. Found on a real page. */
    rules.push({
      reason: 'points the customer at premises this shop does not have',
      patterns: PREMISES_WORDS,
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
 * A NUMBER IS NEVER DRAFTABLE. `rogue-phone-number` exists because an
 * imported FAQ answer ended "easiest way to find out is just to call: (949)
 * 775-1661" — a real line, belonging to the shop, rendering exactly as
 * written, taking calls the ads paid for on a line nothing records. A model
 * cannot know a shop's number, so any number it writes is either invented or
 * copied from training data, and both are worse than that. Same pattern as
 * the daily check, deliberately: a number this screen lets through is one the
 * check would file a finding about tomorrow morning.
 */
const CONTACT_RULES: Rule[] = [
  {
    reason: 'contains a phone number, which a draft can never know',
    // Rebuilt from the source rather than reused: PHONE_RE carries /g for
    // matchAll, and a global regex keeps `lastIndex` between calls, so a
    // shared one would match on one draft and miss on the next.
    patterns: [new RegExp(PHONE_RE.source)],
  },
  {
    reason: 'contains an address or a link',
    patterns: [/\bhttps?:\/\//i, /\b[\w.-]+@[\w.-]+\.[a-z]{2,}\b/i],
  },
]

/**
 * The one question asked of every drafted line: does it claim anything this
 * app cannot back? Returns what tripped, or null when the copy is clean.
 */
export function claimProblem(text: string, input: ClaimContext): ClaimProblem | null {
  for (const rule of [...RULES, ...CONTACT_RULES, ...gatedRules(input)]) {
    for (const pattern of rule.patterns) {
      const hit = text.match(pattern)
      if (hit) return { reason: rule.reason, match: hit[0] }
    }
  }
  return null
}
