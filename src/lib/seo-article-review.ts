/**
 * What a syndicated article is not allowed to say on a shop's behalf.
 *
 * BabyLoveGrowth writes these; nobody at the shop reads them before they go
 * up. That is the whole appeal and also the whole risk, because the content
 * rules in CLAUDE.md are not style preferences — a deductible-waiver offer is
 * illegal to advertise in several states, and a timing promise is a promise
 * this platform cannot keep on behalf of fifteen different shops.
 *
 * So every article is scanned before it can reach a site. A hit does not
 * rewrite the copy and does not delete it: it holds the article in the admin
 * queue with the offending phrase named, for a human to clear or drop. A
 * scanner that edited what it found would be a scanner nobody could audit.
 *
 * This is a floor, not a guarantee. It catches the phrasings that are known
 * to be a problem; it cannot catch a fabricated fact stated plainly ("serving
 * Denver since 1994"), which is why the queue shows the article itself and
 * not just its flags.
 */

export interface ReviewRule {
  /** Short label shown in the admin queue. */
  label: string
  pattern: RegExp
  /** Why this is held, in a sentence an admin can act on. */
  reason: string
}

export const REVIEW_RULES: ReviewRule[] = [
  {
    label: 'Deductible offer',
    // The illegal one. Any shape of "your deductible costs you nothing".
    pattern:
      /\b(waive[sd]?|waiving|cover(s|ed|ing)?|pay(s|ing)?|eliminat\w*|no|zero|free|\$0)\b[^.!?]{0,40}\bdeductibles?\b|\bdeductibles?\b[^.!?]{0,40}\b(waived|covered|on us|free|paid for you)\b/i,
    reason:
      'Offering to waive, cover or pay a deductible is illegal to advertise in several states.',
  },
  {
    label: 'Timing promise',
    pattern:
      /\b(same[- ]day|next[- ]day|within (?:the )?(?:an? )?(?:hour|day|24 hours)|in (?:as little as )?\d{1,3} minutes?|in (?:about )?an hour|under an hour|while you wait|\d{1,2}[- ]hour turnaround|24\/7|round[- ]the[- ]clock)\b/i,
    reason:
      'A scheduling promise can only be made by a shop that made it. The template cannot promise turnaround for every shop.',
  },
  {
    label: 'Insurer endorsement',
    pattern:
      /\b(approved|authoriz\w+|preferred|certified|recommended)\b[^.!?]{0,30}\b(by |for |with )?(insur\w+|carrier|state farm|geico|progressive|allstate|usaa|farmers|nationwide|liberty mutual)\b|\b(insur\w+|carrier)[^.!?]{0,30}\b(approved|preferred provider|preferred shop|authorized (?:shop|provider|dealer))\b/i,
    reason:
      'Claiming an insurer approves, prefers or authorises the shop is a relationship claim this platform cannot verify.',
  },
  {
    label: 'Rating or review claim',
    pattern:
      /\b(five|5)[- ]star\b|\brated (?:#\s?1|number one|top)\b|\b#\s?1 (?:auto glass|glass shop|choice|rated)\b|\b(hundreds|thousands) of (?:happy |satisfied )?(?:customers|reviews)\b|\b\d(?:\.\d)? out of 5\b/i,
    reason:
      'Ratings come from the live Google Business Profile feed. Copy must not assert one of its own.',
  },
  {
    label: 'Warranty named without terms',
    // Naming a warranty and never defining it is the specific failure the
    // content rules exist to prevent.
    pattern: /\b(lifetime|nationwide|limited|unlimited)\b[- ]?\bwarrant(?:y|ies)\b/i,
    reason:
      'A named warranty must state its terms. Check the article defines what it covers and for how long.',
  },
  {
    label: 'Credential claim',
    pattern:
      /\b(AGSC|AGRSS|ASE|I-?CAR|NGA)[- ]?(certified|registered|member)\b|\bcertified technicians?\b|\b(licensed|bonded|insured)\b[^.!?]{0,20}\b(and|&)\b[^.!?]{0,20}\b(licensed|bonded|insured)\b/i,
    reason:
      'A certification is a fact about the business. Confirm the shop holds it before this goes live.',
  },
  {
    label: 'History claim',
    pattern:
      /\b(since|est\.?|established (?:in )?)\s?(?:19|20)\d{2}\b|\b\d{1,3}\+? years (?:of )?(?:experience|in business|serving)\b|\b(family[- ]owned|second[- ]generation|third[- ]generation)\b/i,
    reason:
      'Years in business and ownership history are facts about the shop that must not be invented.',
  },
]

export interface ReviewFinding {
  label: string
  reason: string
  /** The phrase as it appears, so the admin can find it in the article. */
  excerpt: string
}

/** Strip tags so a rule cannot be defeated by markup inside a phrase. */
function toText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Scan an article's visible copy. Returns one finding per rule that hit —
 * not one per occurrence, because an admin needs to know what kind of problem
 * this article has, and the excerpt tells them where to look.
 */
export function reviewArticle(parts: {
  title?: string | null
  excerpt?: string | null
  metaDescription?: string | null
  contentHtml?: string | null
  contentMarkdown?: string | null
}): ReviewFinding[] {
  const body = parts.contentHtml
    ? toText(parts.contentHtml)
    : (parts.contentMarkdown || '')
  const text = [parts.title, parts.metaDescription, parts.excerpt, body]
    .filter(Boolean)
    .join('\n\n')
  if (!text.trim()) return []

  const findings: ReviewFinding[] = []
  for (const rule of REVIEW_RULES) {
    const hit = text.match(rule.pattern)
    if (!hit) continue
    const at = hit.index ?? 0
    findings.push({
      label: rule.label,
      reason: rule.reason,
      excerpt: text.slice(Math.max(0, at - 60), at + hit[0].length + 60).trim(),
    })
  }
  return findings
}

/** How the flags are stored: one string per finding, label first. */
export function flagsFrom(findings: ReviewFinding[]): string[] {
  return findings.map((f) => `${f.label}: …${f.excerpt}…`)
}
