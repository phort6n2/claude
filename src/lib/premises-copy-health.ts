import { premisesClaim } from '@/lib/site-premises'
import type { ScannedField } from '@/lib/rogue-numbers'
import type { FindingDraft } from '@/lib/google-ads-checks'

/**
 * A SERVICE-AREA BUSINESS'S OWN COPY TELLING CUSTOMERS TO COME TO A SHOP.
 *
 * WHY THE FLAG IS NOT ENOUGH. `hasShopLocation` gates every line the TEMPLATE
 * prints — the map card, the serving line, the third "how it works" step, the
 * legal pages, the JSON-LD. It cannot touch editorial free text: a warranty
 * paragraph, an FAQ answer, a story section, city copy, a page kept from the
 * old site. Those are strings in a JSON column, and nothing has ever read them
 * for this. So ticking the box produces a page whose template is correct and
 * whose prose still says "you can come to the shop", and NOTHING GOES RED.
 *
 * FOUND ON NORTHSTAR, AND THE PROVENANCE IS THE WORST PART. Their site carried
 * three of these — "at our Little Elm shop or at your home", "You can come to
 * the shop in Little Elm", "Bring it to us while it's small" — and their own
 * previous website, rendered in full, contains not one premises word anywhere.
 * The importer wrote them. A model handed an address field and asked to draft
 * an FAQ produced premises for a business that has none, which is § 2's
 * invented fact in its one actionable form: somebody drives to an address and
 * finds nothing there. `copy-claims.ts` screens what the drafters write TODAY;
 * this is for everything already in the database, written before that screen
 * existed or imported around it.
 *
 * ONLY FOR A SERVICE-AREA BUSINESS. "Drop the car off" is simply true for the
 * thirteen clients with a unit somebody can drive to, and firing on them would
 * file a finding against almost the whole book — which is how a queue goes
 * permanently red and people stop opening it.
 */

export const PREMISES_COPY_CHECK = 'premises-claim-in-copy'

export interface PremisesCopyHit {
  /** The words that tripped the screen, so they can be searched for verbatim. */
  claim: string
  /** Which field, in words that name a place in the admin. */
  where: string
  /** Enough of the sentence to find it by eye. */
  context: string
}

/**
 * Every premises claim in these fields.
 *
 * Judged SENTENCE BY SENTENCE rather than on the whole field, because the
 * context is what an operator needs: "the story section 'Why us'" names a box
 * to open, and the sentence names the line to delete inside it.
 */
export function findPremisesClaims(fields: ScannedField[]): PremisesCopyHit[] {
  const found: PremisesCopyHit[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    const text = (field.text || '').replace(/<[^>]+>/g, ' ')
    if (!text.trim()) continue
    for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
      const sentence = raw.replace(/\s+/g, ' ').trim()
      if (!sentence) continue
      const claim = premisesClaim(sentence)
      if (!claim) continue
      // One row per phrase per field: an FAQ answer that says "the shop"
      // three times is one sentence to rewrite, not three findings.
      const key = `${field.where}:${claim.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        claim,
        where: field.where,
        context: sentence.length > 200 ? `${sentence.slice(0, 200)}…` : sentence,
      })
    }
  }
  return found
}

export function evaluatePremisesCopy(input: {
  /** `Client.hasShopLocation`. Anything but an explicit false has premises. */
  hasShopLocation: boolean
  fields: ScannedField[]
}): { judged: boolean; drafts: FindingDraft[] } {
  // Not a service-area business: there is nothing here to be wrong about, and
  // saying the check "ran" would resolve a finding filed while the tick was on.
  if (input.hasShopLocation !== false) return { judged: false, drafts: [] }

  const hits = findPremisesClaims(input.fields)
  if (hits.length === 0) return { judged: true, drafts: [] }

  const places = [...new Set(hits.map((h) => h.where))]
  const phrases = [...new Set(hits.map((h) => h.claim))]

  return {
    judged: true,
    drafts: [
      {
        check: PREMISES_COPY_CHECK,
        /* ALERT, unlike `rogue-phone-number`, which is REVIEW because it
           quietly costs a call. This costs a customer: they read the sentence,
           drive to an address, and find nothing there. It is also a claim WE
           invented about their business, on their own site, under their name —
           and the only person who can see it is whoever turns up. Low volume
           by construction (it can only fire for a service-area business, and
           it resolves itself the moment the copy is fixed), so it will not
           teach anybody to scroll past red. */
        severity: 'ALERT',
        entity: 'site-content',
        title:
          hits.length === 1
            ? `Their site still says “${hits[0].claim}” — they have no premises`
            : `${hits.length} lines still send customers to a shop they do not have`,
        detail:
          `This client is marked as a service-area business, so the template prints no address, no map pin and no ` +
          `"bring the vehicle" step. Their EDITORIAL COPY still does, in ${places.join(', ')}: ` +
          `${hits.map((h) => `“${h.context}”`).join(' ')} ` +
          `Free text is the one thing the service-area tick cannot reach — it is a string in a JSON column, not a ` +
          `template line — so this reads exactly like a page that was fixed. A customer who believes one of these ` +
          `sentences drives somewhere and finds nothing, and the wording is ours, not theirs: on the client this was ` +
          `found on, their own previous website contained no premises word anywhere, so the importer wrote it. ` +
          `Edit the wording on the Website tab. Nothing else reports this.`,
        evidence: {
          occurrences: hits,
          fields: places,
          phrases,
        },
      },
    ],
  }
}
