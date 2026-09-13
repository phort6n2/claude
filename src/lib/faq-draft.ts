import { claimProblem, type ClaimContext } from '@/lib/copy-claims'
import { defaultFaq } from '@/lib/site-faq'
import { offeredServices } from '@/lib/story-sections'

/**
 * Drafts the FAQ for a shop that has not written one.
 *
 * Same shape as the story drafter and the same rules — the model supplies
 * prose, `copy-claims.ts` decides what is allowed to survive, nothing is
 * written to the database, and the operator reads every line. Read the top of
 * `story-sections.ts` for why it is built that way.
 *
 * WHAT IS DIFFERENT HERE, AND IT IS THE WHOLE DESIGN. Unlike the story
 * sections, THE FAQ IS NOT EMPTY WHEN THE FIELD IS EMPTY. `site-faq.ts`
 * already renders up to four default answers on every site, and they are the
 * four objections that actually stop a booking: the rate-increase fear, the
 * cash-versus-claim arithmetic, repair versus replacement, and whether the car
 * needs recalibration. Those answers are compliance-reviewed, and the
 * deductible one is built per state from `insurance-rules.ts`.
 *
 * `withDefaultFaq` puts a shop's OWN questions first and fills in behind them,
 * dropping any default whose question the shop has already asked. So a drafted
 * FAQ that wanders onto one of those four topics does real damage, in one of
 * two ways, both silent:
 *
 * - Ask the same question in the same words and the REVIEWED answer is the one
 *   that gets dropped, replaced by an unreviewed one about insurance.
 * - Paraphrase it — "Will my insurance rates go up?" — and the dedupe misses,
 *   so the page asks the same thing twice and answers it twice, once reviewed
 *   and once not, which is worse than either.
 *
 * So the four default topics are named in the prompt AND screened for by
 * keyword. `screenFaq` drops anything that lands on them. That is not a
 * nicety: it is the difference between adding to the FAQ and quietly
 * overwriting the part of it that was written carefully.
 *
 * Pure: facts in, a prompt out, and a screen over what comes back.
 */

/**
 * Twelve is the field's cap; eight is what one press asks for. The template
 * adds its four behind these, so eight drafted means a twelve-question FAQ
 * and no room left — and an FAQ nobody has pruned is one nobody reads.
 */
export const MAX_DRAFT_FAQS = 8

export interface FaqInput extends ClaimContext {
  businessName: string
  city: string
  state: string
  marketArea: string | null
  /** Their own words already on the site, to match voice. */
  existingVoice: string[]
  /** Questions already in the field, so a second press does not repeat them. */
  existingQuestions: string[]
}

export interface FaqDraft {
  q: string
  a: string
}

export interface FaqScreenResult {
  kept: FaqDraft[]
  dropped: Array<{ q: string; reason: string }>
}

/**
 * The topics the template already answers, and how to spot one.
 *
 * Keyed on the SUBJECT rather than the wording, because a paraphrase is the
 * dangerous case: an exact repeat at least dedupes.
 */
const TAKEN_TOPICS: Array<{ topic: string; patterns: RegExp[] }> = [
  {
    topic: 'whether a claim raises your rates',
    patterns: [/\b(rates?|premiums?)\b/i, /\bgo up\b/i],
  },
  {
    topic: 'insurance versus paying directly',
    patterns: [/\b(deductible|insurance|insurer|claim|comprehensive|coverage|cash)\b/i, /\bout[- ]of[- ]pocket\b/i],
  },
  {
    topic: 'repair versus replacement',
    patterns: [
      /\brepair(ed)?\b[^?.]{0,30}\breplac/i,
      /\breplac\w*\b[^?.]{0,30}\brepair/i,
      /\bcan (it|my windshield|the chip) be (repaired|fixed)\b/i,
    ],
  },
  {
    topic: 'camera recalibration',
    patterns: [/calibrat|\bADAS\b|\bcamera\b/i],
  },
]

/** Normalised the same way `withDefaultFaq` normalises, so keys line up. */
const key = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function faqPrompt(input: FaqInput): string {
  const area = input.marketArea?.trim() || `${input.city}, ${input.state}`
  const offered = offeredServices(input.services)
  const voice = input.existingVoice.filter(Boolean).join('\n\n').slice(0, 1500)

  // The live default questions, verbatim, rather than a description of them:
  // the list is per-state and per-service, so hardcoding it here would drift
  // the day site-faq.ts gains a fifth.
  const taken = defaultFaq({
    state: input.state,
    offersAdasCalibration: input.services.offersAdasCalibration,
    offersWindshieldRepair: input.services.offersWindshieldRepair,
  }).map((f) => f.q)

  return `You are drafting the FAQ for a local auto glass shop's website. A human operator reads every answer before it is published, and anything that makes a claim we cannot back is thrown away automatically.

WHAT YOU KNOW ABOUT THIS BUSINESS. This is everything. There is no other source, and you cannot ask.
Business name: ${input.businessName}
Where the shop sits: ${input.city}, ${input.state}
The area the site's headlines name: ${area}
Work they do: ${offered.join(', ') || 'auto glass'}
${input.offersMobileService ? 'They run a mobile unit that travels to the customer.' : 'NO mobile service — the customer comes to the shop. Never imply otherwise.'}
${input.hasShopLocation ? 'They have a shop a customer can come to.' : 'NO premises a customer visits. Never mention a shop or coming in.'}
${input.filesInsuranceClaims ? 'They deal with the insurance carrier directly on the customer’s behalf.' : 'They do NOT file claims for the customer. Never say they handle, file or submit a claim.'}
${input.smsCapable ? 'Their number can receive text messages.' : 'Their number CANNOT receive texts. Never invite anyone to text a photo.'}

QUESTIONS THAT ARE ALREADY ANSWERED ON THIS SITE. Do not ask these, and do not ask anything that lands on the same subject — a rephrasing is worse than a repeat, because the page then answers the same question twice:
${taken.map((q) => `- ${q}`).join('\n')}
${input.existingQuestions.length ? `\nALSO ALREADY IN THE FAQ:\n${input.existingQuestions.map((q) => `- ${q}`).join('\n')}` : ''}
${voice ? `\nTHEIR OWN WORDS ELSEWHERE ON THE SITE — match this voice:\n${voice}\n` : ''}
WHAT TO WRITE
${MAX_DRAFT_FAQS} questions a real customer with a cracked windshield actually types or asks on the phone, and their answers. Not the questions a marketer wishes they asked. Good ground, none of which is taken above: what the shop needs from you to give a quote, what happens to the old glass and the trim, whether the car is safe to drive straight afterwards and what decides that, rain and car washes after a replacement, whether a small chip is worth dealing with now, what makes a crack unrepairable, the difference the vehicle makes, rear and side glass breaking into fragments and what that means for the inside of the car, what happens if something is not right afterwards.

HARD RULES. These come from advertising-compliance review for a regulated trade, not from style. Breaking one throws the whole answer away.
- INVENT NO FACT about this business. Not years in business, not staff or van counts, not certifications or training, not the glass brands they stock, not how many jobs they have done.
- NO TIMING of any kind: no "same day", no "within an hour", no "24/7", no minutes or hours, not "fast" and not "quickly". If the honest answer involves a duration — adhesive cure and safe drive-away time — say that the installer gives you the exact figure for the product used on your job, and do not name a number.
- NO PRICES, no "free", no "affordable", no discounts, and NEVER the word deductible.
- NO INSURER NAMED and no relationship with one: no "approved", no "preferred provider", no "in network". No insurance answers at all — that subject is taken.
- NO WARRANTY mentioned. The site has a warranty band that states the actual terms.
- NOTHING ABOUT THE LAW: not whether a crack is legal to drive with, not inspections, not tickets. That is state law and it is not ours to state.
- NO RATINGS, review counts or star claims, and no customer quotes.
- NO PHONE NUMBER, no email address and no link. You do not know their number, and a number you write is somebody else's.
- Write as the shop ("we"), plainly, and answer the question in the first sentence. Somebody is reading this with a damaged car.
- You MAY explain the TRADE freely — glass, adhesive, calibration as a concept, what damage does if it spreads, what the weather does. That is public knowledge and it is where the substance comes from.

LENGTH: each answer 35–90 words. Questions phrased as a customer would ask them, under 80 characters.

Return ONLY a JSON array, no other text:
[{"q": "...", "a": "..."}]`
}

/**
 * Keep only the questions that are this shop's to answer and not already
 * answered. Dropped, never edited — same rule as the story sections.
 */
export function screenFaq(
  items: Array<{ q?: unknown; a?: unknown }>,
  input: FaqInput
): FaqScreenResult {
  const kept: FaqDraft[] = []
  const dropped: Array<{ q: string; reason: string }> = []

  // Both the template's four and anything already in the field.
  const taken = new Set(
    [
      ...defaultFaq({
        state: input.state,
        offersAdasCalibration: input.services.offersAdasCalibration,
        offersWindshieldRepair: input.services.offersWindshieldRepair,
      }).map((f) => f.q),
      ...input.existingQuestions,
    ].map(key)
  )
  const seen = new Set<string>()

  for (const raw of items) {
    const q = typeof raw.q === 'string' ? raw.q.trim() : ''
    const a = typeof raw.a === 'string' ? raw.a.trim() : ''
    if (!q || !a) {
      dropped.push({ q: q || '(no question)', reason: 'came back empty' })
      continue
    }

    const tripped = claimProblem(`${q}\n${a}`, input)
    if (tripped) {
      dropped.push({ q, reason: `${tripped.reason} (“${tripped.match.trim()}”)` })
      continue
    }

    if (taken.has(key(q))) {
      dropped.push({ q, reason: 'is already answered on the site' })
      continue
    }

    // THE PARAPHRASE CASE, which the dedupe above cannot catch and which is
    // the one that does damage: two answers to one question, one reviewed and
    // one not. Judged on the QUESTION only — an answer that mentions a camera
    // in passing is fine, an answer to "does my car need recalibration?" is
    // not, because the site already answers that one carefully.
    const overlap = TAKEN_TOPICS.find((t) => t.patterns.some((p) => p.test(q)))
    if (overlap) {
      dropped.push({ q, reason: `covers ${overlap.topic}, which the site already answers` })
      continue
    }

    if (seen.has(key(q))) {
      dropped.push({ q, reason: 'repeats a question already drafted' })
      continue
    }
    seen.add(key(q))
    kept.push({ q: q.slice(0, 120), a })
    if (kept.length >= MAX_DRAFT_FAQS) break
  }

  return { kept, dropped }
}
