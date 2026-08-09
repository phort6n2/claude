/**
 * What a client may edit on their own site, and how much of it.
 *
 * The layout is the product — it is designed, tested, and maintained by us,
 * and clients do not restructure it. They edit the handful of fields that are
 * genuinely theirs (their warranty commitment, answers to their customers'
 * questions), within character limits that guarantee the design still holds
 * at every screen size. Anything not listed here is admin-only.
 *
 * Limits are enforced server-side; the editor shows the same numbers so the
 * client never types past them and loses work.
 */

export const CONTENT_LIMITS = {
  warrantyTitle: 60,
  warrantyText: 700,
  faqQuestion: 100,
  faqAnswer: 450,
  maxFaqItems: 8,
} as const

/** Fields a client-portal save is allowed to touch. Everything else is ignored. */
export const CLIENT_EDITABLE_FIELDS = ['warrantyTitle', 'warrantyText', 'faq'] as const

export interface FaqItem {
  q: string
  a: string
}

export interface PortalContentPayload {
  warrantyTitle: string | null
  warrantyText: string | null
  faq: FaqItem[]
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  value?: PortalContentPayload
}

/**
 * Validates and trims a client's submission.
 *
 * The warranty rule is a compliance rule, not a style one: advertising a
 * warranty headline without stating its terms is exactly the failure the
 * site's content rules exist to prevent, so title and terms are
 * paired-or-empty.
 */
export function validatePortalContent(body: unknown): ValidationResult {
  const errors: string[] = []
  const input = (body || {}) as Record<string, unknown>

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const warrantyTitle = str(input.warrantyTitle)
  const warrantyText = str(input.warrantyText)

  if (warrantyTitle.length > CONTENT_LIMITS.warrantyTitle) {
    errors.push(`Warranty name must be ${CONTENT_LIMITS.warrantyTitle} characters or fewer.`)
  }
  if (warrantyText.length > CONTENT_LIMITS.warrantyText) {
    errors.push(`Warranty terms must be ${CONTENT_LIMITS.warrantyText} characters or fewer.`)
  }
  if (warrantyTitle && !warrantyText) {
    errors.push(
      'Add the full warranty terms as well as the name — a warranty can only be shown with what it actually covers.'
    )
  }

  const rawFaq = Array.isArray(input.faq) ? input.faq : []
  if (rawFaq.length > CONTENT_LIMITS.maxFaqItems) {
    errors.push(`You can have up to ${CONTENT_LIMITS.maxFaqItems} questions.`)
  }
  const faq: FaqItem[] = []
  rawFaq.slice(0, CONTENT_LIMITS.maxFaqItems).forEach((item, i) => {
    const q = str((item as FaqItem)?.q)
    const a = str((item as FaqItem)?.a)
    if (!q && !a) return
    if (!q || !a) {
      errors.push(`Question ${i + 1} needs both a question and an answer.`)
      return
    }
    if (q.length > CONTENT_LIMITS.faqQuestion) {
      errors.push(`Question ${i + 1} must be ${CONTENT_LIMITS.faqQuestion} characters or fewer.`)
      return
    }
    if (a.length > CONTENT_LIMITS.faqAnswer) {
      errors.push(`Answer ${i + 1} must be ${CONTENT_LIMITS.faqAnswer} characters or fewer.`)
      return
    }
    faq.push({ q, a })
  })

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    errors: [],
    value: {
      warrantyTitle: warrantyTitle || null,
      warrantyText: warrantyText || null,
      faq,
    },
  }
}
