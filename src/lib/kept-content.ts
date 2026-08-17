import { toE164, telHref } from '@/lib/contact-links'

/**
 * Making another site's copy safe to serve from this one.
 *
 * A captured page is not just text. It carries that site's links, that site's
 * phone number and that site's claims, and all three are wrong here in ways
 * that do not look wrong on screen:
 *
 * - LINKS point at the old site's URL structure. On the new site most of
 *   those paths do not exist. Collision's kept page linked to
 *   /auto-glass-repair-portland, -beaverton and -tualatin: all three 404, on
 *   a page live ads point at.
 * - The PHONE NUMBER is baked into the markup as a tel: anchor. Every visible
 *   number on these sites is swapped to the tracking number at the data layer
 *   (site-phone.ts) precisely so calls can be recorded and scored. A hardcoded
 *   anchor walks straight past that, so the calls this page earns are the ones
 *   that never appear in call tracking — and Collision's captured number was
 *   not even the one the rest of the site shows.
 * - CLAIMS in the copy are frozen at the moment the old page was written.
 *   "4.9 stars from 365 Google reviews" was true once; the live feed moves and
 *   the sentence does not.
 *
 * The first two are fixed here, at render, on every request. The third cannot
 * be — rewriting a claim is editing what a business says about itself — so it
 * is reported to the operator instead.
 */

/** A phone number as a human writes one, in text rather than an attribute. */
const PHONE_TEXT = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g

/** A rating or review-count claim frozen into the copy. */
const RATING_CLAIM =
  /\b\d(?:\.\d)?\s*(?:\/\s*5\b|stars?\b|out of 5\b)|\b\d{2,5}\s+(?:google\s+)?reviews?\b/i

export interface KeptIssue {
  kind: 'rating' | 'deadLink' | 'phone' | 'duplicate'
  detail: string
}

/**
 * Point the copy's links and phone numbers at this site.
 *
 * `servedPaths` is every address this shop actually answers on. A same-site
 * link to anything else loses its href and keeps its text — the same move the
 * white-label sanitiser makes, and for the same reason: the words were still
 * written by the business, it is only the destination that is wrong. Deleting
 * the sentence would be editing their copy; leaving a 404 in front of a paid
 * visitor would be worse than either.
 */
export function retargetKeptHtml(
  html: string,
  opts: { phone?: string | null; servedPaths?: Iterable<string>; siteOwnsTracking?: boolean }
): string {
  if (!html) return ''
  const served = new Set(
    [...(opts.servedPaths || [])].map((p) => p.toLowerCase().replace(/\/+$/, '') || '/')
  )
  const e164 = opts.phone ? toE164(opts.phone) : ''
  let out = html

  // tel: anchors — href AND the number people read, which is usually the
  // anchor's own text. Rewriting one without the other shows a visitor one
  // number and dials another, which is worse than either mistake alone.
  //
  // ONLY when this app has a tracking number of its own on the site. The
  // first version rewrote unconditionally and it was wrong in the one case
  // that mattered: Collision has no in-app tracking number, and the number in
  // their captured copy was a HighLevel tracking line feeding their Google
  // Ads call conversions. Replacing it with the shop's real switchboard
  // number swapped a MEASURED number for an unmeasured one — the exact
  // failure the rewrite existed to prevent, pointing the other way. A number
  // already in the copy is somebody's deliberate choice; it is only safe to
  // override when we are overriding it with something tracked.
  if (e164 && opts.phone && opts.siteOwnsTracking) {
    const display = opts.phone
    out = out.replace(/<a\b([^>]*?)href="tel:[^"]*"([^>]*)>([\s\S]*?)<\/a>/gi, (_m, a, b, text) => {
      const retargeted = text.replace(PHONE_TEXT, display)
      return `<a${a}href="${telHref(display)}"${b}>${retargeted}</a>`
    })
  }

  // Same-site links to addresses this shop does not serve.
  out = out.replace(/<a\b([^>]*?)href="(\/[^"]*)"([^>]*)>/gi, (whole, a, href, b) => {
    const path = href.split('#')[0].split('?')[0].toLowerCase().replace(/\/+$/, '') || '/'
    if (served.size === 0 || served.has(path)) return whole
    return `<a${a}data-dead-link="${path}"${b}>`
  })

  return out
}

/** Section headings the hosted template already renders, further down. */
const TEMPLATE_TOPICS: Array<{ label: string; test: RegExp }> = [
  { label: 'the steps band', test: /\b(steps?|how it works|what happens|process)\b/i },
  { label: 'the insurance section', test: /\b(insurance|deductible|claim|carrier|what .*pay|cost)\b/i },
  { label: 'the warranty section', test: /\bwarranty|guarantee\b/i },
  { label: 'the reviews band', test: /\breviews?|stars?|testimonial/i },
  { label: 'the service areas', test: /\b(areas?|coverage|serve|serving|neighbou?rhoods?)\b/i },
  { label: 'the gallery', test: /\b(gallery|our work|real vehicles|photos?)\b/i },
  { label: 'the services grid', test: /\b(services|what we (do|handle|fix))\b/i },
  { label: 'the FAQ', test: /\b(faq|frequently asked|common questions)\b/i },
]

export interface KeptSection {
  /** Position in the stored HTML, and the handle the trim action uses. */
  index: number
  heading: string
  html: string
  chars: number
  /** The template section this one repeats, when it does. */
  duplicates: string | null
  issues: KeptIssue[]
}

/**
 * The captured copy, cut into the sections its own headings define.
 *
 * The point is the operator being able to see WHAT is on the page and drop a
 * piece of it, rather than scrolling a textarea of somebody else's markup.
 * Collision's longest kept page ran to twelve thousand characters and six of
 * its ten sections said again what the template says below them — steps,
 * insurance, warranty, reviews, coverage, gallery. That is the reason the page
 * reads as endless, and no amount of shortening the labels fixes it.
 *
 * Duplicates are FLAGGED, NEVER DROPPED AUTOMATICALLY. A shop's own wording
 * about its own warranty may well be better than the template's, and deciding
 * that on their behalf, silently, at import time, is not a decision code
 * should make.
 */
export function splitKeptSections(html: string): KeptSection[] {
  if (!html) return []
  const parts: KeptSection[] = []
  // Everything up to the first h2 is the lead-in; then one section per h2.
  const pieces = html.split(/(?=<h2\b)/i).filter((p) => p.trim())
  pieces.forEach((piece, index) => {
    const headingMatch = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(piece)
    const heading = headingMatch
      ? headingMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : 'Opening text'
    const text = piece.replace(/<[^>]+>/g, ' ')
    const topic = TEMPLATE_TOPICS.find((t) => t.test.test(heading))
    const issues: KeptIssue[] = []
    if (RATING_CLAIM.test(text)) {
      issues.push({
        kind: 'rating',
        detail: 'States a rating or review count. The live Google figure is shown further down.',
      })
    }
    if (PHONE_TEXT.test(text)) {
      PHONE_TEXT.lastIndex = 0
      issues.push({ kind: 'phone', detail: 'Contains a phone number written into the copy.' })
    }
    PHONE_TEXT.lastIndex = 0
    parts.push({
      index,
      heading,
      html: piece,
      chars: text.replace(/\s+/g, ' ').trim().length,
      duplicates: topic ? topic.label : null,
      issues,
    })
  })
  return parts
}

/** Rebuild the stored HTML with the given section indexes removed. */
export function dropKeptSections(html: string, drop: number[]): string {
  const remove = new Set(drop)
  return splitKeptSections(html)
    .filter((s) => !remove.has(s.index))
    .map((s) => s.html.trim())
    .join('\n')
}


/**
 * The captured copy as CHAPTERS, the shape every other page type uses.
 *
 * A kept page must be indistinguishable in layout from a service or location
 * page — same hero, same chapter block, same sections below. The copy was
 * previously dropped into a prose column of its own, which is how it read as
 * a wall of text bolted onto a template rather than part of one.
 *
 * The first piece is whatever preceded the source's first h2. It renders as
 * headingless lead-in copy — the page's own H1 is already in the hero, and
 * repeating it as a chapter heading put the same words on screen twice.
 */
export function keptChapters(
  html: string
): Array<{ heading: string; body: string; photoUrl: string; bodyHtml: string }> {
  return splitKeptSections(html)
    .map((section) => {
      // The lead-in has no heading of its own and must not borrow the page's:
      // the H1 is already on screen in the hero a few hundred pixels above.
      const heading = section.heading === 'Opening text' ? '' : section.heading
      // The h2 becomes the chapter's own heading, so it must not also stay
      // inside the body or every chapter prints its title twice.
      const bodyHtml = section.html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '').trim()
      return { heading, body: '', photoUrl: '', bodyHtml }
    })
    .filter((c) => c.bodyHtml)
}
