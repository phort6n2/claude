/**
 * Phone numbers on a hosted site that are not the number the site tracks.
 *
 * The template's own numbers are swapped at the data layer (site-phone.ts), so
 * every phone it prints is the tracked one. EDITORIAL COPY is not: a warranty
 * paragraph, an FAQ answer or a page kept from the old site is free text, and
 * an imported one routinely carries the shop's old line — "easiest way to find
 * out is just to call: (949) 775-1661" was sitting in a live FAQ answer, and
 * in the FAQ schema with it.
 *
 * That is a call the ads paid for, arriving on a line nothing records, scores
 * or reports. Nothing else in the app would ever notice it: the number is
 * correct, it belongs to the shop, and it renders exactly as intended.
 *
 * Pure: text in, findings out. No database, no network — so it can be checked
 * against real copy without a client.
 */

import { formatPhoneDisplay } from '@/lib/lead-display'

/**
 * US numbers as people actually write them, deliberately strict.
 *
 * Requires a separator or parentheses somewhere, because a bare run of ten
 * digits is more often an order number, a VIN fragment or a licence than a
 * phone number, and a false positive on a compliance line is worse than a
 * miss. 1-800 style prefixes are covered by the optional leading 1.
 */
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)/g

/** Last ten digits — the only comparison that survives formatting. */
export function last10(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export interface RogueNumber {
  /** As written in the copy, so it can be searched for verbatim. */
  number: string
  /** Which field it is in, in words that name a place in the admin. */
  where: string
  /** Enough surrounding text to find the sentence. */
  context: string
}

export interface ScannedField {
  where: string
  text: string | null | undefined
}

/**
 * Every phone number in these fields that is not one of `allowed`.
 *
 * `allowed` is normally just the number the site displays. The shop's own
 * line is NOT automatically allowed: when a tracking number is in use, the
 * real line printed in an FAQ is exactly the leak this looks for.
 */
export function findRogueNumbers(
  fields: ScannedField[],
  allowed: Array<string | null | undefined>
): RogueNumber[] {
  const ok = new Set(allowed.map(last10).filter((d) => d.length === 10))
  const found: RogueNumber[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    const text = (field.text || '').replace(/<[^>]+>/g, ' ')
    if (!text.trim()) continue
    for (const match of text.matchAll(PHONE_RE)) {
      const written = match[0].trim()
      const digits = last10(written)
      if (digits.length !== 10 || ok.has(digits)) continue
      // One row per number per field: an FAQ that repeats the old line four
      // times is one thing to fix, not four.
      const key = `${field.where}:${digits}`
      if (seen.has(key)) continue
      seen.add(key)
      const at = match.index ?? 0
      const context = text
        .slice(Math.max(0, at - 60), at + written.length + 60)
        .replace(/\s+/g, ' ')
        .trim()
      found.push({ number: written, where: field.where, context: `…${context}…` })
    }
  }
  return found
}

/** The finding an operator sees, if there is one. */
export function evaluateRogueNumbers(input: {
  fields: ScannedField[]
  siteNumber: string | null
}): Array<{
  check: string
  severity: 'ALERT' | 'REVIEW'
  entity: string
  title: string
  detail: string
  evidence: Record<string, unknown>
}> {
  const rogue = findRogueNumbers(input.fields, [input.siteNumber])
  if (rogue.length === 0) return []

  const numbers = [...new Set(rogue.map((r) => r.number))]
  const places = [...new Set(rogue.map((r) => r.where))]
  return [
    {
      check: 'rogue-phone-number',
      // REVIEW, not ALERT: it is costing calls quietly rather than burning
      // money by tonight, and the fix is an edit at the desk.
      severity: 'REVIEW',
      entity: 'site-content',
      title:
        numbers.length === 1
          ? `${numbers[0]} is printed on the site and is not the tracked number`
          : `${numbers.length} untracked phone numbers are printed on the site`,
      detail:
        `The site's own phones all show ${formatPhoneDisplay(input.siteNumber) || 'the shop line'}, but this copy names ` +
        `${numbers.join(', ')} in ${places.join(', ')}. A visitor who calls the number in the text ` +
        `arrives on a line that is not recorded, scored or reported to Google Ads. Edit the wording, ` +
        `or drop the number and let the page's own call buttons carry the call.`,
      evidence: { siteNumber: input.siteNumber, numbers, occurrences: rogue },
    },
  ]
}

/**
 * Every editorial field on a client, flattened for scanning.
 *
 * Takes the rows rather than fetching them, so the caller decides what a
 * "live" page is — a held page is not on the site and its old phone number is
 * not a problem yet.
 */
export function editorialFields(input: {
  content: {
    warrantyText?: string | null
    footerBlurb?: string | null
    faq?: unknown
    chapters?: unknown
  } | null
  cityContent?: Array<{ city: string; body?: string | null }>
  keptPages?: Array<{ path: string; title?: string | null; bodyHtml?: string | null }>
}): ScannedField[] {
  const fields: ScannedField[] = []
  const c = input.content
  if (c) {
    fields.push({ where: 'the warranty text', text: c.warrantyText })
    fields.push({ where: 'the footer blurb', text: c.footerBlurb })
    if (Array.isArray(c.faq)) {
      for (const [i, row] of (c.faq as Array<{ q?: string; a?: string }>).entries()) {
        fields.push({ where: `FAQ answer ${i + 1}`, text: `${row?.q || ''} ${row?.a || ''}` })
      }
    }
    if (Array.isArray(c.chapters)) {
      for (const row of c.chapters as Array<{ heading?: string; body?: string }>) {
        fields.push({
          where: `the story section “${row?.heading || 'untitled'}”`,
          text: `${row?.heading || ''} ${row?.body || ''}`,
        })
      }
    }
  }
  for (const city of input.cityContent || []) {
    fields.push({ where: `the ${city.city} city copy`, text: city.body })
  }
  for (const page of input.keptPages || []) {
    fields.push({ where: `the kept page ${page.path}`, text: `${page.title || ''} ${page.bodyHtml || ''}` })
  }
  return fields
}
