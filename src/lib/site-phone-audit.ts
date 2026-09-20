import { last10 } from '@/lib/rogue-numbers'
import type { FindingDraft } from '@/lib/google-ads-checks'

/**
 * IS THE TRACKING NUMBER ACTUALLY ON THE PAGE, EVERYWHERE IT SHOULD BE?
 *
 * `site-phone.ts` swaps the displayed number at the data layer and two dozen
 * components read the swapped object, which is exactly why nothing has ever
 * checked the result: the swap is correct by construction, right up until it
 * is not. A component that captured `client.phone` before the swap, a kept
 * page carrying the old site's markup, a `useOnSite` flag nobody set, a
 * deploy that did not take — every one of those renders a perfectly valid
 * page with the shop's own line on it, and the only symptom is paid clicks
 * arriving on a number nothing records. No error, no missing row, a quiet
 * week. `rogue-numbers.ts` reads the DATABASE for this; it cannot see what
 * the page actually rendered, and those are not the same question.
 *
 * THE RULE IS DIRECTION, NOT PRESENCE (see site-phone.ts):
 *
 * - Every `tel:` and `sms:` href is INBOUND and must be the display number.
 *   A text is inbound too — that reversal is the whole point of the SMS
 *   webhook, and an `sms:` to the shop's handset is a lead nothing attributes.
 * - The LocalBusiness JSON-LD keeps the REAL line, deliberately. A tracking
 *   number there splits the NAP signal local ranking leans on, so finding one
 *   in the schema is its own fault and the opposite of the one above.
 *
 * Pure: pages in, findings out. Nothing here fetches, so
 * `scripts/check-site-phone-audit.ts` can hold every case against fixed HTML.
 */

export const PHONE_RENDER_CHECK = 'tracking-number-not-shown'
export const SCHEMA_PHONE_CHECK = 'tracking-number-in-schema'
export const NOT_ON_SITE_CHECK = 'tracking-number-not-used-on-site'

export interface ScannedPage {
  /** Path as published, for naming the page in the finding. */
  path: string
  html: string
}

export interface PhoneAuditInput {
  /** What every tel:/sms: link should be — the tracked number when there is one. */
  displayNumber: string | null
  /** Every active tracking number the client has, in any format. */
  trackingNumbers: string[]
  /** The shop's own line. */
  realPhone: string | null
  /** True when an active tracking number exists but none is flagged for the site. */
  hasActiveNumberButNoneOnSite: boolean
  pages: ScannedPage[]
}

/** `tel:+17145821740` / `sms:+1714...?&body=` — the href, not the text. */
const LINK_RE = /(?:href|HREF)=["'](tel:|sms:)([^"'?]+)/g

/** `"telephone":"+1714..."` inside a JSON-LD block, however it is spaced. */
const SCHEMA_PHONE_RE = /"telephone"\s*:\s*"([^"]+)"/g

export interface WrongLink {
  path: string
  scheme: 'tel' | 'sms'
  /** As written in the href. */
  number: string
  /** True when this is the shop's own line rather than some third number. */
  isShopLine: boolean
}

export function findWrongLinks(input: PhoneAuditInput): WrongLink[] {
  const want = last10(input.displayNumber)
  if (!want) return []
  const real = last10(input.realPhone)
  const out: WrongLink[] = []
  const seen = new Set<string>()

  for (const page of input.pages) {
    for (const m of page.html.matchAll(LINK_RE)) {
      const scheme = m[1] === 'tel:' ? 'tel' : 'sms'
      const digits = last10(m[2])
      if (!digits || digits === want) continue
      // One row per number per page per scheme: a header, a footer and a
      // mobile bar all carrying the same wrong number is ONE thing to fix.
      const key = `${page.path}:${scheme}:${digits}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ path: page.path, scheme, number: m[2], isShopLine: !!real && digits === real })
    }
  }
  return out
}

/** Pages that render no call link at all — the swap having produced nothing. */
export function pagesWithNoCallLink(input: PhoneAuditInput): string[] {
  return input.pages
    .filter((p) => !/(?:href|HREF)=["']tel:/.test(p.html))
    .map((p) => p.path)
}

/** A tracking number in the LocalBusiness schema, which must never happen. */
export function trackingNumbersInSchema(input: PhoneAuditInput): Array<{ path: string; number: string }> {
  const tracked = new Set(input.trackingNumbers.map(last10).filter((d) => d.length === 10))
  if (tracked.size === 0) return []
  const out: Array<{ path: string; number: string }> = []
  const seen = new Set<string>()
  for (const page of input.pages) {
    // Only inside JSON-LD. A "telephone" key elsewhere is not the schema.
    for (const block of page.html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )) {
      for (const m of block[1].matchAll(SCHEMA_PHONE_RE)) {
        const digits = last10(m[1])
        if (!tracked.has(digits)) continue
        const key = `${page.path}:${digits}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ path: page.path, number: m[1] })
      }
    }
  }
  return out
}

export function auditPhones(input: PhoneAuditInput): { judged: boolean; drafts: FindingDraft[] } {
  const drafts: FindingDraft[] = []

  /* THIS ONE NEEDS NO PAGES AT ALL, and is the loudest. A client with a
     tracking number they are paying for, and no flag telling the site to use
     it, shows their own line on every page — so every click the ads bought
     arrives somewhere nothing records, scores or reports. The site is
     perfect; the switch is off. */
  if (input.hasActiveNumberButNoneOnSite) {
    drafts.push({
      check: NOT_ON_SITE_CHECK,
      severity: 'ALERT',
      entity: 'site-phone',
      title: 'They have a tracking number, and the site is not showing it',
      detail:
        'An active tracking number exists for this client but none is flagged to show on the site, so every page prints the shop’s own line. ' +
        'Calls from the website — including every one the ads paid for — arrive on a number that is not recorded, not scored and not reported to Google Ads, ' +
        'and nothing else would ever notice: the pages render correctly and the calls connect. ' +
        'Tick “Show on site” on one of their tracking numbers.',
      evidence: { trackingNumbers: input.trackingNumbers },
    })
  }

  // Nothing fetched: report what we could, and do NOT claim the rest passed.
  if (input.pages.length === 0) {
    return { judged: false, drafts }
  }

  const wrong = findWrongLinks(input)
  if (wrong.length > 0) {
    const shopLine = wrong.filter((w) => w.isShopLine)
    const paths = [...new Set(wrong.map((w) => w.path))]
    drafts.push({
      check: PHONE_RENDER_CHECK,
      /* ALERT when it is the shop's OWN line: that is the whole failure this
         exists for, live on the page, on every click. A third number is a
         REVIEW — odd, worth reading, but not the tracked/untracked swap
         going wrong. */
      severity: shopLine.length > 0 ? 'ALERT' : 'REVIEW',
      entity: 'site-phone',
      title:
        shopLine.length > 0
          ? `The site links calls to the shop’s own line, not the tracking number`
          : `${wrong.length} call link${wrong.length === 1 ? '' : 's'} point at the wrong number`,
      detail:
        `Every “call us” and “text us” link on these pages should dial ${input.displayNumber}. ` +
        `${wrong
          .slice(0, 6)
          .map((w) => `${w.path} has a ${w.scheme}: link to ${w.number}`)
          .join('; ')}${wrong.length > 6 ? `, and ${wrong.length - 6} more` : ''}. ` +
        (shopLine.length > 0
          ? 'That is the shop’s own line: the calls the ads paid for arrive on a number nothing records, scores or reports, and the page looks perfectly correct. '
          : '') +
        'The template swaps this at the data layer, so a link that escaped it is either a page kept from the old site or a component that read the number before the swap.',
      evidence: { expected: input.displayNumber, pages: paths, links: wrong.slice(0, 20) },
    })
  }

  const silent = pagesWithNoCallLink(input)
  if (silent.length > 0) {
    drafts.push({
      check: PHONE_RENDER_CHECK,
      severity: 'REVIEW',
      entity: 'site-phone-missing',
      title: `${silent.length} page${silent.length === 1 ? '' : 's'} render no call link at all`,
      detail:
        `These pages carry no tel: link anywhere: ${silent.join(', ')}. ` +
        'Every page type on these sites is meant to have the number in the header, so a page with none is either a kept page from the old site or a render that lost it. ' +
        'A visitor on that page has no way to ring them.',
      evidence: { pages: silent },
    })
  }

  const schema = trackingNumbersInSchema(input)
  if (schema.length > 0) {
    drafts.push({
      check: SCHEMA_PHONE_CHECK,
      // The OPPOSITE fault to the one above, and it needs its own row: the
      // fix is to stop swapping here, not to start swapping there.
      severity: 'REVIEW',
      entity: 'site-schema-phone',
      title: 'The LocalBusiness markup is publishing a tracking number',
      detail:
        `The schema on ${[...new Set(schema.map((s) => s.path))].join(', ')} carries ${schema[0].number}, which is a tracking number. ` +
        'Schema is deliberately NOT swapped: search engines cross-check it against the Google Business Profile, and a number that does not match splits the NAP signal local ranking leans on. ' +
        'Pages build their schema from the real client and render with the swapped one — this one has the order the wrong way round.',
      evidence: { occurrences: schema },
    })
  }

  return { judged: true, drafts }
}
