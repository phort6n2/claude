import { SERVICE_PAGES, type ServiceFlag } from '@/lib/site-services'
import { insuranceForState } from '@/lib/insurance-rules'
import { PHONE_RE, last10 } from '@/lib/rogue-numbers'
import type { FindingDraft } from '@/lib/google-ads-checks'

/**
 * What the ad assets SAY, checked against what this app knows about the shop.
 *
 * `google-ads-assets.ts` counts assets and has never read one word of them. So
 * an account can pass the coverage audit with a full set of sitelinks and
 * callouts advertising work the shop does not do, a warranty the site never
 * defines, a claim service they do not offer, and a phone number nothing
 * records. MAG Mobile passes the count on every kind and its copy contains
 * four of those at once.
 *
 * WHY THIS IS NOT `copy-claims.ts`, AND THE LINE MATTERS. That screen governs
 * copy THIS PLATFORM drafts for fifteen shops at once, so it bans a timing
 * promise outright — the platform cannot promise scheduling on a shop's
 * behalf. An ad asset is different: an operator wrote it for ONE named shop,
 * and "same-day appointments" may be perfectly true of that shop. Flagging
 * every timing claim in an ad account would file dozens of findings nobody can
 * act on, and a check people scroll past is worse than no check.
 *
 * SO EVERY RULE HERE NEEDS A FACT ON OUR SIDE THAT CONTRADICTS THE AD. Not a
 * word we dislike — a contradiction. The shop does not offer that service. The
 * flag that gates that claim on their own website is off. There are no
 * warranty terms anywhere for the warranty the ad names. The state has no
 * zero-deductible rule. That number is not one of theirs. Each of those is
 * arguable by nobody, which is the same standard the rest of the sweep holds.
 *
 * Pure: lines of copy and a few facts in, findings out — so it runs against
 * saved rows from a real account with no credentials.
 */

export const ASSET_CLAIM_CHECK = 'asset-claims'

/** One piece of ad copy, and where a person would go to edit it. */
export interface AdCopyLine {
  /** e.g. `Sitelink "Windshield Replacement"`, `Callout`, `RSA headline`. */
  where: string
  text: string
  /** Names the campaign in the finding when the asset is not account-level. */
  campaign?: string
}

export interface ClaimFacts {
  /** Two-letter state, for the deductible rule. */
  state: string | null
  serviceAreas: string[]
  /** Cities of the shop's own locations, which are covered by definition. */
  shopCities: string[]
  offersMobileService: boolean
  filesInsuranceClaims: boolean
  smsCapable: boolean
  /** Whether the site states warranty terms anywhere. */
  hasWarrantyTerms: boolean
  services: Record<ServiceFlag, boolean>
  /** Every number that legitimately belongs to this shop, any format. */
  knownPhones: string[]
  /**
   * Measured median minutes from lead to first touch, or null when there is
   * not enough data. See `response-time.ts` — this is the shop's own
   * behaviour, not an estimate.
   */
  medianResponseMinutes: number | null
}

export interface ClaimProblem {
  where: string
  text: string
  /** What contradicts it, and where to change one or the other. */
  problem: string
  severity: 'ALERT' | 'REVIEW'
  campaign?: string
}

/** Keywords that name a service, per flag. Deliberately narrow. */
const SERVICE_WORDS: Array<[ServiceFlag, RegExp]> = [
  ['offersWindshieldReplacement', /\bwindshield replacement\b/i],
  ['offersWindshieldRepair', /\bwindshield repair\b/i],
  ['offersRockChipRepair', /\b(rock ?chip|chip repair)\b/i],
  ['offersSideWindowRepair', /\b(side|door|quarter) (window|glass)\b/i],
  ['offersBackWindowRepair', /\b(back|rear) (glass|window|windshield)\b/i],
  ['offersSunroofRepair', /\b(sunroof|moonroof)\b/i],
  ['offersAdasCalibration', /(\bADAS\b|calibrat)/i],
]

/** A promise of a response time, and the minutes it names. */
function promisedMinutes(text: string): number | null {
  // "text back in 5 minutes", "call you back in 10 min", "response in 15 mins"
  const m = text.match(/\b(?:in|within|under)\s+(\d{1,3})\s*(?:minute|minutes|min|mins)\b/i)
  if (m) return Number(m[1])
  const hour = text.match(/\b(?:in|within|under)\s+(?:an?|1)\s+hour\b/i)
  if (hour) return 60
  return null
}

export function assetClaimProblems(lines: AdCopyLine[], facts: ClaimFacts): ClaimProblem[] {
  const problems: ClaimProblem[] = []
  const covered = new Set(
    [...facts.serviceAreas, ...facts.shopCities]
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
  )
  const knownDigits = new Set(facts.knownPhones.map((p) => last10(p)).filter((d) => d.length === 10))
  const rule = insuranceForState(facts.state)

  for (const line of lines) {
    const text = (line.text || '').trim()
    if (!text) continue
    const add = (problem: string, severity: 'ALERT' | 'REVIEW') =>
      problems.push({ where: line.where, text, problem, severity, campaign: line.campaign })

    /* A PHONE NUMBER THAT IS NOT THEIRS. The worst case here is not a wrong
       number — it is a RIGHT one that this app does not track: the shop's old
       line in a call asset takes calls the ads paid for on a line nothing
       records, scores or attributes, and it is invisible in every report
       because the call simply never happens as far as we can see. Exactly the
       `rogue-phone-number` problem, in the ad account rather than the site. */
    for (const match of text.matchAll(new RegExp(PHONE_RE.source, 'g'))) {
      const digits = last10(match[0])
      if (digits.length === 10 && !knownDigits.has(digits)) {
        add(
          `${match[0]} is not a number on this client — calls from the ads land on a line this app does not record or attribute. Either it is wrong, or it is the shop's own untracked line.`,
          'ALERT'
        )
      }
    }

    /* THE DEDUCTIBLE CLAIM. §2 forbids a deductible-waiver offer because it is
       illegal to advertise in several states — but it is NOT a waiver where
       the state's own law removes the deductible, and `insurance-rules.ts`
       (already compliance-reviewed, per state) is what decides which. So in
       Florida "$0 with most FL insurance" is a statement of that law and it
       stands; in a state with no such rule the same words are the offer §2
       bans. This is why the check reads the state rather than the phrase. */
    const zeroCost =
      /(\$\s?0|\bzero\b|\bno\b|\bfree\b|\bwaive)/i.test(text) &&
      /\b(deductible|insurance|insured|claim)\b/i.test(text)
    if (zeroCost) {
      if (rule.rule !== 'automatic') {
        add(
          `A zero-cost insurance claim, in a state with no automatic no-deductible rule for glass (${facts.state || 'state not set'}). §2 forbids advertising a deductible waiver — it is illegal in several states. Either the state rule in insurance-rules.ts says otherwise, or this asset has to go.`,
          'ALERT'
        )
      } else if (
        /* THE SCOPE IS THE ASSET, NOT THE LINE. A sitelink's descriptions
           belong to its link text, and that is where the glass type actually
           is: MAG's asset reads `Back Glass Replacement` / `Rear windshield
           and defroster` / `$0 with most FL insurance`, three separate lines,
           and the claim is only wrong because of the first one. Checking the
           line alone finds nothing at all — which is what the fixture caught. */
        /\b(back|rear|side|door|quarter) (glass|window)\b|\bsunroof\b/i.test(
          `${line.where} ${text}`
        )
      ) {
        /* THE HALF OF THE STATE RULE THAT GETS LOST. Florida's statute covers
           the WINDSHIELD specifically — insurance-rules.ts says so in its own
           note: "Door glass and back glass go through your ordinary
           deductible." So "$0 with most FL insurance" is true on a windshield
           sitelink and false on a back-glass one, and the two sit next to each
           other in the same asset list reading identically. Nothing but this
           pairing could catch it. */
        add(
          `A zero-cost claim attached to glass the state rule does not cover. ${facts.state}'s no-deductible law is for the WINDSHIELD; back, side and sunroof glass go through the ordinary deductible (see the note in insurance-rules.ts). True on a windshield asset, not on this one.`,
          'ALERT'
        )
      }
    }

    /* CLAIM FILING, which is a per-shop flag on their own website. An ad
       promising it for a shop whose `filesInsuranceClaims` is off is a promise
       the shop never made, made on their behalf, to somebody who will hold
       them to it on the phone. */
    if (
      !facts.filesInsuranceClaims &&
      /\b(we|our)\b[^.]{0,24}\b(file|files|filing|handle|handles|submit|submits)\b[^.]{0,16}\bclaim/i.test(text)
    ) {
      add(
        'Says the shop files the claim, but `filesInsuranceClaims` is off for this client — their own site is gated to say only that they will check coverage. Turn the flag on if it is true, or change the asset.',
        'ALERT'
      )
    }

    /* MOBILE SERVICE, same rule. "We come to you" for a shop with no mobile
       unit books an appointment nobody can keep. */
    if (
      !facts.offersMobileService &&
      /\b(mobile|we come to you|come to you|at your (home|office|driveway|work)|in your driveway|on-?site)\b/i.test(text)
    ) {
      add(
        'Advertises mobile service, and `offersMobileService` is off for this client. Their site never claims it.',
        'REVIEW'
      )
    }

    /* TEXTING A LANDLINE. An ad inviting a text is a dead end that costs the
       lead and looks, to the customer, like being ignored. */
    if (!facts.smsCapable && /\b(text (us|me|back)|send (us )?a text|by text|text us a photo)\b/i.test(text)) {
      add(
        'Invites a text message, and `smsCapable` is off — the number cannot receive one, so the customer is texting into nothing.',
        'ALERT'
      )
    }

    /* A NAMED WARRANTY WITH NO TERMS ANYWHERE. §2: naming one without
       defining it is the failure the content rules exist to prevent. In a
       30-character callout the terms cannot fit, so the site has to carry
       them — and if the warranty band is empty, nothing does. */
    if (!facts.hasWarrantyTerms && /\b(lifetime|warrant(y|ies)|guarantee)\b/i.test(text)) {
      add(
        'Names a warranty, and this client has no warranty terms on their site — so nothing anywhere states what it covers. §2: a named warranty must state its terms. Fill in the warranty on the Website tab, or drop the asset.',
        'REVIEW'
      )
    }

    // A SERVICE THEY DO NOT OFFER. The site's services grid strips its own
    // card; an ad asset advertises it until somebody calls about it.
    for (const [flag, pattern] of SERVICE_WORDS) {
      if (facts.services[flag]) continue
      if (!pattern.test(text)) continue
      const name = SERVICE_PAGES.find((s) => s.flag === flag)?.name.toLowerCase() || flag
      add(
        `Advertises ${name}, which is switched off for this client — their site does not offer it. Turn the service on if they do it, or remove the asset.`,
        'REVIEW'
      )
    }

    /* A CITY THEY DO NOT LIST. Reported as REVIEW, never ALERT: coverage is a
       business fact and the service-area list is often simply behind what the
       shop actually does. The finding is "these two disagree", not "the ad is
       wrong" — a town in the ads and not in `serviceAreas` is as likely to
       mean the list needs updating, and it also means no location page is
       being built for a city they are paying to appear in. */
    if (covered.size) {
      const cities = text.match(
        /\b(?:auto glass|windshield|glass)\s+(?:in\s+|repair\s+in\s+|replacement\s+in\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/
      )
      const named = cities?.[1]?.trim().toLowerCase()
      if (named && !covered.has(named) && named.length > 3) {
        add(
          `Names ${cities?.[1]}, which is not in this client's service areas — so no location page is built for a city the ads target. Add it on the Website tab if they cover it.`,
          'REVIEW'
        )
      }
    }

    /* A RESPONSE TIME THE SHOP IS NOT MEETING. The one timing claim worth
       checking, because this app MEASURES it (`response-time.ts`, median from
       `Lead.firstTouchedAt`). "Text back in 5 minutes" against a measured
       median of three hours is not a style objection, it is the shop's own
       data contradicting their own ad — and it is the promise a customer
       remembers when they are deciding whether this shop answers the phone.
       3x the promise before it fires: a median at twice a five-minute promise
       is still a shop answering fast. */
    const promised = promisedMinutes(text)
    if (promised !== null && facts.medianResponseMinutes !== null) {
      if (facts.medianResponseMinutes > promised * 3) {
        add(
          `Promises a reply in ${promised} minutes; the measured median time to first touch on this client's leads is ${Math.round(facts.medianResponseMinutes)} minutes. Their own data does not support the ad.`,
          'REVIEW'
        )
      }
    }
  }

  return problems
}

/**
 * One finding per problem kind, not per asset.
 *
 * Twelve sitelinks that each advertise sunroof glass are ONE thing to fix, and
 * twelve findings for it is how the "Needs action" page becomes something
 * people close. The assets are listed in the evidence.
 */
export function evaluateAssetClaims(
  problems: ClaimProblem[],
  facts: { businessName: string }
): FindingDraft[] {
  if (!problems.length) return []

  const byProblem = new Map<string, ClaimProblem[]>()
  for (const p of problems) {
    const key = `${p.severity}|${p.problem}`
    const list = byProblem.get(key) || []
    list.push(p)
    byProblem.set(key, list)
  }

  return [...byProblem.entries()].map(([key, group]) => {
    const first = group[0]
    const count = group.length
    return {
      check: ASSET_CLAIM_CHECK,
      severity: first.severity,
      // Entity is the PROBLEM, so the same one persisting is one row whose
      // lastSeenAt moves rather than a new finding every week.
      entity: `asset-claim:${key.slice(0, 80)}`,
      title: `${facts.businessName}: ${count} ad asset${count === 1 ? '' : 's'} — ${first.problem.split('.')[0]}`,
      detail: first.problem,
      evidence: {
        assets: group.map((p) => ({
          where: p.where,
          text: p.text,
          ...(p.campaign ? { campaign: p.campaign } : {}),
        })),
        count,
      },
    }
  })
}
