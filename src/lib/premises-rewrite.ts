import { targetIsWritable } from '@/lib/rogue-numbers'
import { premisesClaim } from '@/lib/site-premises'
import { claimProblem, type ClaimContext } from '@/lib/copy-claims'
import type { PremisesCopyHit } from '@/lib/premises-copy-health'

/**
 * REWRITING THE SENTENCES THAT SEND A MOBILE SHOP'S CUSTOMERS TO A SHOP.
 *
 * The finding names three sentences and the tab they live on, and the edit is
 * then somebody's afternoon: find the FAQ answer, work out which half of it is
 * the problem, rewrite it without accidentally promising something else, do it
 * twice more. A model is good at exactly that — it is prose, not fact — and
 * this is the one shape of fix in the findings queue where that is true. A
 * spend cliff is not fixed by better wording.
 *
 * THE MODEL IS A SOURCE OF PROSE, NOT OF FACTS, and everything here exists to
 * hold that line. The prompt carries only what this app already knows about
 * the shop and says those are the only facts that exist; every rewrite is then
 * screened by BOTH gates before anybody sees it:
 *
 *   premisesClaim  — it must not have kept, or reintroduced, a premises word.
 *   claimProblem   — it must not have bought its way out by promising
 *                    something else: "we come to you" for a shop with no
 *                    mobile unit, "text us a photo" to a landline, a timing
 *                    promise, a phone number. Those are § 2's gated claims and
 *                    a rewrite is exactly where one would arrive unnoticed.
 *
 * A REWRITE THAT TRIPS EITHER IS DROPPED, NOT TRIMMED — the same rule the
 * story drafter follows. A half-repaired sentence is one nobody wrote and
 * nobody reviewed, and the operator can no longer tell which half came from a
 * model. The drop is reported with the words that caused it, because a screen
 * firing silently looks exactly like the model returning two rewrites instead
 * of three, and the obvious next move — press it again — is the one that
 * cannot help.
 *
 * NOTHING HERE WRITES. The route proposes; a person reads the before and the
 * after and presses Apply. That is deliberately stricter than the bulk city
 * drafter, which saves unread — that one FILLS EMPTY pages, where the
 * alternative is a blank page carrying noindex. This one REWRITES copy
 * somebody may have curated, and an action that silently overwrites a
 * hand-edited paragraph is one nobody presses twice.
 */

export interface RewriteTarget {
  /** Stable id for matching the model's answer back to the hit. */
  id: string
  /** The sentence to replace, verbatim. */
  sentence: string
  /** Where it lives, in the operator's words. */
  where: string
  /** The words that tripped the screen. */
  claim: string
}

export interface RewriteFacts {
  businessName: string
  /** What the headlines call the area, or the city. */
  area: string
  city: string
  state: string
  offersMobileService: boolean
  smsCapable: boolean
  filesInsuranceClaims: boolean
  serviceAreas: string[]
}

export function rewritePrompt(targets: RewriteTarget[], facts: RewriteFacts): string {
  return `You are correcting sentences on the website of ${facts.businessName}, an auto glass company.

THE PROBLEM. This business is a SERVICE-AREA BUSINESS. It has NO shop, garage, workshop or storefront that a customer can drive to. There is no address a customer can visit. Every sentence below currently tells the customer to come to a place, bring the vehicle somewhere, drop it off, or visit them. Each one is false and a customer who believes it will drive somewhere and find nothing.

THE ONLY FACTS THAT EXIST about this business are these. You may use these and nothing else:
- Based in ${facts.city}, ${facts.state}. This is where they are based; it is NOT a place customers go.
- They work across ${facts.area}.
${facts.serviceAreas.length ? `- Towns they cover: ${facts.serviceAreas.slice(0, 12).join(', ')}.\n` : ''}- Mobile service (they travel to the vehicle): ${facts.offersMobileService ? 'YES' : 'NO'}
- Can receive text messages: ${facts.smsCapable ? 'YES' : 'NO'}
- Handles insurance claims directly with the carrier: ${facts.filesInsuranceClaims ? 'YES' : 'NO'}

RULES, all of them absolute:
1. REMOVE the claim about premises. Do not replace it with a different claim.
2. Invent NOTHING. No hours, no prices, no timeframes, no certifications, no years in business, no staff, no insurers, no phone numbers, no links.
3. NO TIMING PROMISES of any kind — not "same day", not "within the hour", not "fast", not "quickly".
${facts.offersMobileService ? '4. You MAY say they come to the vehicle, because they do.' : '4. Do NOT say they come to you or travel to the vehicle. They do not offer mobile service.'}
${facts.smsCapable ? '5. You may mention texting them.' : '5. Do NOT invite a text message. Their number cannot receive one.'}
6. Keep the shop’s own voice and roughly the original length. Write as the business: "we", never "they" and never "the shop".
7. Change ONLY what makes the sentence false. If half the sentence is fine, keep that half word for word.

Return ONLY a JSON array, one object per sentence, no prose around it:
[{"id": "<the id given>", "rewrite": "<the corrected sentence>"}]

The sentences:
${targets.map((t) => `\nid: ${t.id}\nwhere: ${t.where}\nflagged words: "${t.claim}"\nsentence: ${t.sentence}`).join('\n')}`
}

export interface Proposal {
  id: string
  where: string
  before: string
  after: string
}

export interface RejectedProposal {
  id: string
  where: string
  before: string
  /** What came back, so the operator can see it was not silently nothing. */
  after: string
  /** Why it was thrown away, naming the words. */
  reason: string
}

export interface ScreenResult {
  proposals: Proposal[]
  rejected: RejectedProposal[]
}

/**
 * Both gates, over whatever the model returned.
 *
 * Also used on APPLY, against the text the browser sends back — a proposal
 * arriving from a client is just text, and re-screening it is the difference
 * between a review step and a suggestion box wired to the database.
 */
export function screenRewrites(
  raw: Array<{ id?: unknown; rewrite?: unknown }>,
  targets: RewriteTarget[],
  context: ClaimContext
): ScreenResult {
  const byId = new Map(targets.map((t) => [t.id, t]))
  const proposals: Proposal[] = []
  const rejected: RejectedProposal[] = []

  for (const row of raw) {
    const id = typeof row?.id === 'string' ? row.id : ''
    const after = typeof row?.rewrite === 'string' ? row.rewrite.trim() : ''
    const target = byId.get(id)
    if (!target) continue

    const add = (reason: string) =>
      rejected.push({ id, where: target.where, before: target.sentence, after, reason })

    if (!after) {
      add('came back empty')
      continue
    }
    // A "rewrite" identical to the original has fixed nothing, and applying it
    // would resolve the finding tomorrow while the sentence still reads the
    // same — the queue lying, which is the one thing it must never do.
    if (after === target.sentence) {
      add('came back unchanged')
      continue
    }
    const premises = premisesClaim(after)
    if (premises) {
      add(`still points at premises (“${premises}”)`)
      continue
    }
    const claim = claimProblem(after, context)
    if (claim) {
      add(`${claim.reason} (“${claim.match}”)`)
      continue
    }
    /* Length is a proxy for "it rewrote the paragraph instead of the
       sentence". Both screens pass on a beautiful three-sentence expansion
       that says things nobody approved, and the operator reading a diff
       cannot tell added prose from kept prose at a glance. */
    if (after.length > target.sentence.length * 2 + 40) {
      add('came back far longer than the sentence it replaces')
      continue
    }
    /* Length alone let a four-sentence paragraph through on a long original.
       Count sentences too: the job is to repair ONE, and three extra ones are
       three claims nobody asked for sitting in a diff that looks like a fix. */
    const sentences = (after.match(/[.!?](\s|$)/g) || []).length
    const was = (target.sentence.match(/[.!?](\s|$)/g) || []).length || 1
    if (sentences > was + 1) {
      add(`came back as ${sentences} sentences in place of ${was}`)
      continue
    }
    proposals.push({ id, where: target.where, before: target.sentence, after })
  }

  // Anything the model simply did not answer for is reported too, or three
  // sentences in and two out reads as the button half working.
  for (const t of targets) {
    if (proposals.some((p) => p.id === t.id) || rejected.some((r) => r.id === t.id)) continue
    rejected.push({
      id: t.id,
      where: t.where,
      before: t.sentence,
      after: '',
      reason: 'the model returned nothing for this one',
    })
  }

  return { proposals, rejected }
}

/** Stable ids, so a rewrite can be matched back to the sentence it is for. */
export function targetsFrom(hits: PremisesCopyHit[]): RewriteTarget[] {
  return hits
    // `writable: false` rather than a list of kinds. A field added to
    // `editorialFields` that this button cannot write back to has to be
    // excluded by the marker it carries, or the next one is excluded by
    // nobody and gets a rewrite applied to a field that does not exist.
    .filter((h) => targetIsWritable(h.target))
    .map((h, i) => ({
      id: `s${i + 1}`,
      sentence: h.sentence,
      where: h.where,
      claim: h.claim,
    }))
}

/**
 * Replace one sentence inside a field, or report that it is no longer there.
 *
 * EXACT MATCH ONLY. A fuzzy replace is how an apply that runs a day after the
 * proposal silently edits a sentence somebody has since changed by hand — the
 * operator's edit disappears and nothing says so. Missing is a normal outcome
 * and is reported as one.
 */
export function replaceSentence(
  fieldText: string | null | undefined,
  before: string,
  after: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = fieldText || ''
  if (!text.includes(before)) {
    return { ok: false, reason: 'that sentence is no longer in the copy — it may already be edited' }
  }
  return { ok: true, text: text.replace(before, after) }
}
