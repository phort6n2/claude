import { isVendorUrl, VENDOR_HOSTS } from '@/lib/article-whitelabel'

/**
 * THE SUPPLIER'S MONTHLY SEO REPORT, read into our own report.
 *
 * The SEO supplier emails one PDF per site per month to the platform owner.
 * It is forwarded into the app (see `seo-report-inbound.ts`) and read here so
 * the shop sees the WORK inside our monthly report, never as a second document
 * with somebody else's layout. §2's white-label rule is why the PDF itself is
 * never shown to a client.
 *
 * THREE SECTIONS, CHOSEN, NOT EVERYTHING THE PDF SAYS:
 *   - articles published  — the proof the work is being done
 *   - links earned        — authority, and the strongest sites linking in
 *   - AI answers          — how often assistants name the shop
 *
 * LEFT OUT ON PURPOSE, and each for a reason that will come up again:
 *   - Its GOOGLE SEARCH figures. This app reads Search Console itself for the
 *     Traffic report, and the PDF's own small print says its figures cover the
 *     first week of the month only — two "clicks" numbers for one month on one
 *     page teaches the shop that one of them is invented.
 *   - "AD SPEND SAVED" and "BACKLINK COST SAVED". The supplier's estimates, in
 *     dollars. Every figure in our report is either Google's or the shop's own
 *     bookkeeping; a made-up dollar value in a report about money is the number
 *     the owner will question first.
 *   - SITE HEALTH. The owner's decision: an audit list of open issues reads to
 *     a shop owner as a list of things wrong with their site.
 *
 * NO MODEL READS THIS. The layout is regular, so fixed rules read it and cannot
 * invent a number; a figure that is not on the page is absent, not guessed. The
 * cost is that a layout change breaks a section — so a section whose HEADING
 * is present but whose figures cannot be read is reported in `problems`, never
 * silently dropped. An absence and a failure are different facts.
 *
 * THE PDF CONTRADICTS ITSELF IN TWO PLACES, and each fact is taken from ONE
 * place, chosen once:
 *   - Authority: page 1 says "YOUR SITE'S AUTHORITY 23", the authority chart
 *     says DR 17 → DR 18. The PDF was generated weeks after the month ended,
 *     so the tile is the rating on the day it was printed and the chart is the
 *     month. The chart is used.
 *   - AI share: the chart says 23% for the month, the sentence says "this run:
 *     6 of 20 answers (30%), against 15% in Jul". The sentence is used: it is
 *     the one that names its own sample and its own comparison.
 *
 * Pure: lines in, a report out, so `scripts/check-seo-report.ts` holds the real
 * layout without a PDF library, a database or a network.
 */

export interface SeoReportArticle {
  title: string
  /** As printed, "Aug 5, 2026". */
  published: string
}

export interface SeoReportArticles {
  /** How many the supplier published in the period. */
  published: number
  /** "Visitors from articles", when the tile is present. */
  visitors: number | null
  /** The ones the PDF lists by name — a sample, not all of them. */
  list: SeoReportArticle[]
}

export interface SeoReportLinks {
  links: number
  referringDomains: number
  /** Domain rating at the start of the comparison and now, when readable. */
  ratingFrom: number | null
  ratingTo: number | null
  /** "Jul 2026" — what the change is measured against. */
  since: string | null
  strongest: Array<{ domain: string; rating: number }>
}

export interface SeoReportAi {
  /** Answers naming the shop, of those asked, in the latest run. */
  named: number
  asked: number
  share: number
  previousShare: number | null
  previousLabel: string | null
  /** "Visitors from AI" on the summary page, when present. */
  visitors: number | null
  byAssistant: Array<{ name: string; share: number }>
  /** Other businesses the assistants named, the shop itself excluded. */
  competitors: Array<{ name: string; share: number }>
}

export interface SeoReport {
  /** Bare hostname the report is about, `example.com`. */
  site: string | null
  /** As printed, "Aug 1, 2026 – Aug 31, 2026". */
  period: string | null
  year: number | null
  month: number | null
  articles: SeoReportArticles | null
  links: SeoReportLinks | null
  ai: SeoReportAi | null
  /** A section whose heading was found but whose figures could not be read. */
  problems: string[]
  /** Anything in the file that names the supplier. Non-empty → never shown. */
  supplierTraces: string[]
}

export interface SeoReportInput {
  pages: string[][]
  columns: Array<{ left: string[]; right: string[] }>
  info?: Record<string, string>
  links?: string[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Headings are letter-spaced ("S H A R E O F V O I C E"); compare them squashed. */
const squash = (s: string) => s.replace(/\s+/g, '').toUpperCase()
const int = (s: string) => Number(s.replace(/,/g, ''))

/** The index of the first line whose squashed form contains `needle`. */
function findLine(lines: string[], needle: string, from = 0): number {
  for (let i = from; i < lines.length; i++) if (squash(lines[i]).includes(needle)) return i
  return -1
}

/** Lines after a heading, up to the next line matching any `stops`. */
function sectionAfter(lines: string[], heading: string, stops: string[]): string[] | null {
  const at = findLine(lines, heading)
  if (at < 0) return null
  const out: string[] = []
  for (let i = at + 1; i < lines.length; i++) {
    const sq = squash(lines[i])
    if (stops.some((stop) => sq.includes(stop))) break
    out.push(lines[i])
  }
  return out
}

/** The column (of every page) that contains a heading, or null. */
function columnWith(input: SeoReportInput, heading: string): string[] | null {
  for (const col of input.columns) {
    if (findLine(col.left, heading) >= 0) return col.left
    if (findLine(col.right, heading) >= 0) return col.right
  }
  return null
}

function hostOf(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * The summary tiles are a row of labels over a row of values, three to a row.
 * Read by ORDER within the row: the labels are found in the line, sorted by
 * where they sit, and paired with the values beneath.
 */
function tileValue(pages: string[][], label: string): number | null {
  const LABELS = [
    'AD SPEND SAVED',
    'BACKLINK COST SAVED',
    'IMPRESSIONS',
    'VISITORS FROM ARTICLES',
    'VISITORS FROM AI',
    "YOUR SITE'S AUTHORITY",
  ]
  for (const lines of pages) {
    for (let i = 0; i < lines.length - 1; i++) {
      const upper = lines[i].toUpperCase()
      if (!upper.includes(label)) continue
      // "VISITORS FROM ARTICLES" contains no other label, but "IMPRESSIONS"
      // appears inside other rows' prose — only rows made of labels count.
      const present = LABELS.map((l) => ({ l, at: upper.indexOf(l) }))
        .filter((p) => p.at >= 0)
        // "VISITORS FROM AI" is not a prefix of another label, but guard the
        // pattern anyway: a label found inside a longer one is not its own.
        .filter((p, _, all) => !all.some((q) => q !== p && q.l.includes(p.l) && q.at <= p.at && q.at + q.l.length >= p.at + p.l.length))
        .sort((a, b) => a.at - b.at)
      const values = lines[i + 1].split(/\s+/)
      if (values.length !== present.length) continue
      const at = present.findIndex((p) => p.l === label)
      if (at < 0) continue
      const raw = values[at]
      // Only a plain count. "$6.7K" and "2.2K" are rounded for display and are
      // not figures this report repeats.
      if (!/^\d[\d,]*$/.test(raw)) return null
      return int(raw)
    }
  }
  return null
}

function readArticles(input: SeoReportInput, problems: string[]): SeoReportArticles | null {
  // The count is in the right-hand column heading: "3 1 A RT I C L E S …".
  let published: number | null = null
  let headingSeen = false
  for (const col of input.columns) {
    for (const line of [...col.left, ...col.right]) {
      const m = squash(line).match(/(\d+)ARTICLESPUBLISHED/)
      if (m) published = int(m[1])
      if (squash(line).includes('CONTENTTHATLANDED')) headingSeen = true
    }
  }
  if (published === null) {
    if (headingSeen) problems.push('Articles: the heading is there but the number published could not be read.')
    return null
  }

  /* THE LIST. Titles and their top keyword sit in the left column, one under
     the other; the publish dates sit in the right column, one per article.
     Keywords are search terms and arrive in lower case, titles in title
     case — which is what separates them, and what lets a title that wraps
     onto a second line be joined back together. If the titles and the dates
     do not pair up one-to-one the list is dropped and the count kept: a title
     against the wrong date is worse than no list. */
  let list: SeoReportArticle[] = []
  for (const col of input.columns) {
    const titles = sectionAfter(col.left, 'ARTICLE&TOPKEYWORD', ['WHEREPEOPLEMENTIONED', 'AUTHORITY'])
    const dates = sectionAfter(col.right, 'PUBLISHEDVISITORS', ['WHEREPEOPLEMENTIONED', 'AUTHORITY'])
    if (!titles || !dates) continue
    const when = dates
      .map((d) => d.match(/^([A-Z][a-z]{2} \d{1,2}, \d{4})\b/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => m[1])
    /* EXACTLY TWO LINES PER ARTICLE is the common case — a title, then its
       keyword — and it is decided by COUNT, not by what the lines look like.
       Case was the first rule and the second real report broke it: Speedy's
       keywords include "XPEL vs 3M" and "ADAS calibration targets", read as
       titles, so four titles met five dates and the whole list was dropped.
       Only when the count does not come out even (a title that wrapped) does
       the case rule decide, joining a wrapped title back together. */
    const joined: string[] = []
    if (titles.length === when.length * 2) {
      for (let i = 0; i < titles.length; i += 2) joined.push(titles[i])
    } else {
      let current = ''
      for (const line of titles) {
        if (/^[a-z0-9]/.test(line)) {
          if (current) joined.push(current)
          current = ''
        } else {
          current = current ? `${current} ${line}` : line
        }
      }
      if (current) joined.push(current)
    }
    if (joined.length && joined.length === when.length) {
      list = joined.map((title, i) => ({ title, published: when[i] }))
    } else if (joined.length || when.length) {
      problems.push(
        `Articles: ${joined.length} titles against ${when.length} dates, so the list was left out (the count of ${published} stands).`
      )
    }
    break
  }

  return { published, visitors: tileValue(input.pages, 'VISITORS FROM ARTICLES'), list }
}

function readLinks(input: SeoReportInput, problems: string[]): SeoReportLinks | null {
  // Found by its SENTENCE, not its heading: page 1 carries a "Domain rating"
  // tile too, and a heading search lands there first.
  const col = columnWith(input, 'LINKSACROSS')
  if (!col) {
    if (input.columns.some((c) => findLine(c.left, 'DOMAINRATING') >= 0 && findLine(c.left, 'LINKQUALITY') >= 0)) {
      problems.push('Links: the authority section is there but its sentence could not be read.')
    }
    return null
  }
  const text = col.join(' ')
  /* THREE SENTENCES SEEN SO FAR, one per state: "Up 1 point since Jul
     2026, from 35 links…", "Level since Jul 2026, from 20 links…" (Speedy —
     the rating did not move), and "Earned, from 7 links…" (AGK — no history
     yet). The second was read as unreadable until it was seen. */
  const moved = text.match(
    /(Up|Down)\s+(\d+)\s+points?\s+since\s+([A-Z][a-z]{2,8}\s+\d{4}),\s+from\s+([\d,]+)\s+links\s+across\s+([\d,]+)\s+referring\s+domains/i
  )
  const level = moved
    ? null
    : text.match(/Level\s+since\s+([A-Z][a-z]{2,8}\s+\d{4}),\s+from\s+([\d,]+)\s+links\s+across\s+([\d,]+)\s+referring\s+domains/i)
  const m = moved
    ? { delta: int(moved[2]) * (moved[1].toLowerCase() === 'down' ? -1 : 1), since: moved[3], links: moved[4], domains: moved[5] }
    : level
      ? { delta: 0, since: level[1], links: level[2], domains: level[3] }
      : null
  const plain = m ? null : text.match(/from\s+([\d,]+)\s+links\s+across\s+([\d,]+)\s+referring\s+domains/i)
  if (!m && !plain) {
    problems.push('Links: the authority section is there but its sentence could not be read.')
    return null
  }

  /* The chart prints each month's rating as a bare "DR 17" line. Which is the
     start and which the end is decided by the sentence's direction, never by
     the order the lines come out in — the chart places the higher value
     higher on the page, so reading order is value order, not time order. */
  const ratings = col
    .map((l) => l.match(/^DR (\d+)$/))
    .filter((r): r is RegExpMatchArray => !!r)
    .map((r) => int(r[1]))
  let ratingFrom: number | null = null
  let ratingTo: number | null = null
  if (m && ratings.length) {
    const { delta } = m
    // Level: every value printed must be the same one, or the sentence and
    // the chart disagree and neither is used.
    const candidates =
      delta === 0
        ? new Set(ratings).size === 1
          ? [ratings[0]]
          : []
        : ratings.filter((r) => ratings.includes(r - delta))
    if (candidates.length === 1) {
      ratingTo = candidates[0]
      ratingFrom = candidates[0] - delta
    }
  }

  // Strongest links: "stacyknows.com DR 41", in whichever column holds them.
  const strongest: SeoReportLinks['strongest'] = []
  for (const c of input.columns) {
    for (const side of [c.left, c.right]) {
      const rows = sectionAfter(side, 'STRONGESTLINKSEARNED', ['AUDITED', 'SITEHEALTH', 'LINKQUALITY'])
      if (!rows) continue
      for (const row of rows) {
        const r = row.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)\s+DR\s+(\d+)$/i)
        if (r) strongest.push({ domain: r[1].toLowerCase(), rating: int(r[2]) })
      }
    }
  }

  return {
    links: int(m ? m.links : plain![1]),
    referringDomains: int(m ? m.domains : plain![2]),
    ratingFrom,
    ratingTo,
    since: m ? m.since : null,
    strongest: strongest.slice(0, 5),
  }
}

/** Assistants the supplier might name. Anything else in that list is a guess. */
const ASSISTANTS = /^(ChatGPT|Claude|Gemini|Perplexity|Copilot|Grok|Meta AI|DeepSeek|Google AI (?:Overviews?|Mode)|AI Overviews?|AI Mode)$/i

function readAi(input: SeoReportInput, problems: string[], ownName: string | null): SeoReportAi | null {
  const col = columnWith(input, 'THISRUN:')
  if (!col) {
    /* NOT RUN YET IS AN ABSENCE, NOT A FAILURE. AGK's report says "We have
       not run AI visibility checks for this site yet" under the heading —
       nothing to read, and nothing wrong with the reader. Only a heading with
       neither a run nor that sentence is reported. */
    const all = input.columns.flatMap((c) => [...c.left, ...c.right]).join(' ')
    if (/not run AI visibility checks|Nothing checked yet/i.test(all)) return null
    for (const c of input.columns) {
      if ([...c.left, ...c.right].some((l) => squash(l).includes('AISEARCHVISIBILITY'))) {
        problems.push('AI answers: the section is there but its headline sentence could not be read.')
        break
      }
    }
    return null
  }
  const text = col.join(' ')
  const m = text.match(
    /This run:\s*(\d+)\s+of\s+(\d+)\s+answers\s*\((\d+)%\)\s*,?\s*(?:against\s+(\d+)%\s+in\s+([A-Z][a-z]{2,8}\s+\d{4}))?/i
  )
  if (!m) {
    problems.push('AI answers: the section is there but its headline sentence could not be read.')
    return null
  }

  const pct = (line: string) => line.match(/^(.+?)\s+(\d{1,3})%$/)
  const byAssistant: SeoReportAi['byAssistant'] = []
  const competitors: SeoReportAi['competitors'] = []
  for (const c of input.columns) {
    for (const side of [c.left, c.right]) {
      for (const row of sectionAfter(side, 'BYASSISTANT', ['PROMPTBYPROMPT', 'SHAREOFVOICE']) || []) {
        const r = pct(row)
        if (r && ASSISTANTS.test(r[1].trim())) byAssistant.push({ name: r[1].trim(), share: int(r[2]) })
      }
      /* SHARE OF VOICE. The shop's own entry wraps across three lines in the
         real file ("Collision Auto Glass &" / "30%" / "Calibration") and so
         never matches a "name N%" row — which is fine: the shop's own share is
         the headline figure above. Any row that does name the shop is dropped
         too, so it can never be listed as its own competitor. */
      for (const row of sectionAfter(side, 'SHAREOFVOICE', ['PROMPTBYPROMPT', 'THESEAREESTIMATES', 'SEARCHCONSOLE']) || []) {
        const r = pct(row)
        if (!r) continue
        const name = r[1].trim()
        if (ASSISTANTS.test(name) || /^DR\b/.test(name)) continue
        if (ownName && squash(name).startsWith(squash(ownName).slice(0, 12))) continue
        competitors.push({ name, share: int(r[2]) })
      }
    }
  }

  return {
    named: int(m[1]),
    asked: int(m[2]),
    share: int(m[3]),
    previousShare: m[4] ? int(m[4]) : null,
    previousLabel: m[5] || null,
    visitors: tileValue(input.pages, 'VISITORS FROM AI'),
    byAssistant,
    competitors: competitors.slice(0, 5),
  }
}

/** Month from a printed period, "Aug 1, 2026 – Aug 31, 2026". */
function monthOfPeriod(period: string | null): { year: number; month: number } | null {
  const m = period?.match(/^([A-Z][a-z]{2})[a-z]*\s+\d{1,2},\s+(\d{4})/)
  if (!m) return null
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  return month ? { year: Number(m[2]), month } : null
}

/**
 * Everything in the file that points at the supplier: document info fields,
 * link annotations, and the text itself. Checked on every report, because the
 * sample was clean and a supplier's template is theirs to change.
 */
export function supplierTraces(input: SeoReportInput): string[] {
  const out: string[] = []
  const names = /babylove|baby\s*love\s*growth/i
  for (const [key, value] of Object.entries(input.info || {})) {
    if (names.test(value) || VENDOR_HOSTS.some((h) => value.toLowerCase().includes(h))) {
      out.push(`document ${key}: ${value.slice(0, 80)}`)
    }
  }
  for (const link of input.links || []) if (isVendorUrl(link)) out.push(`link: ${link}`)
  for (const line of input.pages.flat()) {
    if (names.test(line) || VENDOR_HOSTS.some((h) => line.toLowerCase().includes(h))) {
      out.push(`text: ${line.slice(0, 80)}`)
    }
  }
  return out
}

export function parseSeoReport(input: SeoReportInput, options?: { ownName?: string | null }): SeoReport {
  const problems: string[] = []
  const first = input.pages[0] || []
  const site = first.map(hostOf).find((h): h is string => !!h) ?? null
  const period = first.find((l) => /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+[–-]\s+/.test(l)) ?? null
  const when = monthOfPeriod(period)
  // The shop's own name, for dropping it from its own competitor list: the
  // caller's is best; the document title ("Name — https://…") is next.
  const ownName =
    options?.ownName ?? (input.info?.Title ? input.info.Title.split(/\s+[—-]\s+/)[0] : null)

  return {
    site,
    period,
    year: when?.year ?? null,
    month: when?.month ?? null,
    articles: readArticles(input, problems),
    links: readLinks(input, problems),
    ai: readAi(input, problems, ownName),
    problems,
    supplierTraces: supplierTraces(input),
  }
}
