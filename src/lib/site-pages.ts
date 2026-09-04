import { prisma } from '@/lib/db'

/**
 * Pages a shop kept from their old site, for the footer.
 *
 * A kept page that nothing links to is reachable only by someone who already
 * has its address — which is the old inbound link it was built to catch, and
 * nothing else. That is enough to stop the address dying, and not enough for
 * the page to be part of the site. One footer link is what makes it a page
 * rather than a landing pad.
 *
 * PUBLISHED ONLY. A held page 404s, and a footer link to a 404 on every page
 * of the site is worse than no link at all.
 *
 * Bounded at eight. The footer column has services above it and this is a
 * cutover tail, not a section — a shop with forty kept pages has a navigation
 * problem that a longer list makes worse.
 */
export interface KeptPageLink {
  path: string
  title: string
}

/**
 * The state a title tails off with. TWO patterns, not one, and the split is
 * the point.
 *
 * A full state name can be matched case-insensitively — no English sentence
 * ends in "oregon" by accident. A two-letter CODE cannot: "or", "in", "ca"
 * and "id" are ordinary words, and a single case-insensitive list turns the
 * perfectly reasonable title "Repair or Replace" into "Repair". So a code is
 * only a code when it was written in capitals, which is how a state code is
 * always written and how a word never is.
 */
// The optional preposition is not decoration. "Windshield Chip Repair in
// Oregon" without it becomes "Windshield Chip Repair in" — a heading ending
// on a dangling word, which reads worse than the state did.
const STATE_NAME_TAIL =
  /(?:[\s,]+(?:in|near|serving))?[\s,]+(oregon|washington|california|nevada|idaho|utah|colorado|montana|arizona|texas|florida|new york)$/i
const STATE_CODE_TAIL = /(?:[\s,]+(?:in|near|serving))?[\s,]+(OR|WA|CA|NY|TX|FL|AZ|NV|ID|UT|CO|MT)$/

function stripStateTail(value: string): string {
  return value.replace(STATE_NAME_TAIL, '').replace(STATE_CODE_TAIL, '').trim()
}

/**
 * The pitch an SEO title wraps around the subject.
 *
 * These titles are written for a search result, not a menu: "Fast Auto Glass
 * Repair Service", "Affordable Back Glass Replacement Near Me". The adjective
 * and the trailing "Service" are the same word on every page, so in a list of
 * eight they are the part that makes them hard to tell apart — the subject is
 * what is left.
 *
 * "Mobile" and "Free" are deliberately NOT in the list. Mobile service is a
 * different job from shop service, and a free quote is an offer; both are the
 * subject rather than decoration around it.
 */
const SALES_PREFIX =
  /^(?:the\s+)?(?:fast|quick|speedy|affordable|cheap|low\s+cost|best|top|top[\s-]rated|expert|professional|quality|reliable|trusted|premier|premium|local|emergency|same[\s-]day|24\/7)\s+/i
const SALES_SUFFIX = /[\s,-]+(?:services?|solutions?|specialists?|experts?|near\s+me|near\s+you)$/i

function stripSalesWords(value: string): string {
  // Trailing punctuation FIRST. These titles really read "Fast Back Glass
  // Repair Service - | Auto Glass Kings": the SEO tail is cut at the pipe and
  // leaves a dangling hyphen, which is not visible in the rendered label
  // because it is trimmed at the end — but it sits between "Service" and the
  // end of the string while this runs, so the suffix rule matched nothing and
  // every label kept the word it exists to remove. Found by reading the live
  // titles; my first cases were reconstructed from the rendered text, which
  // is exactly the input that cannot show this.
  let out = value.replace(/^[\s,:—–-]+|[\s,:—–-]+$/g, '').trim()
  // Looped: "Fast Affordable Auto Glass Repair" carries two of them.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(SALES_PREFIX, '').trim()
    if (next === out) break
    // Never let the pitch eat the whole label.
    if (next.split(/\s+/).length < 2) break
    out = next
  }
  const trimmed = out.replace(SALES_SUFFIX, '').trim()
  if (trimmed.split(/\s+/).length >= 2) out = trimmed
  return out
}

/**
 * A captured title with the tail an SEO title carries taken off it.
 *
 * These came off the old site and read
 * "Auto Glass Repair Hillsboro OR | Collision Auto Glass": correct in a
 * <title> tag, wrong as an H1, and wrong in the browser tab too once the page
 * metadata appends the business name and says it twice.
 *
 * Three steps, each undoing a convention every one of these titles shares:
 * everything after the first separator (the brand, the region, the pitch),
 * the shop's own name wherever it sits, and a trailing state or state code.
 * The whole site is one business in one state; none of that identifies the
 * page.
 */
export function stripSeoTail(title: string, businessName?: string | null): string {
  const full = (title || '').trim()
  if (!full) return ''
  let out = full.split(/\s*[|·—–]\s*/)[0].trim()
  if (businessName) {
    const escaped = businessName.trim().replace(/[.*+?^${}()[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\s*\\b${escaped}\\b\\s*`, 'ig'), ' ').trim()
  }
  out = stripStateTail(out).replace(/\s+/g, ' ').trim()
  // A dangling separator, which these titles really do carry: cutting
  // "Fast Back Glass Repair Service - | Auto Glass Kings" at the pipe leaves
  // the hyphen behind, and it was rendering as the last character of the H1
  // on every one of those pages.
  out = out.replace(/^[\s,:—–-]+|[\s,:—–-]+$/g, '').trim()
  return out.length >= 3 ? out : full
}

/**
 * A page title shortened into something that fits a footer menu.
 *
 * The titles come off an old site and they are SEO titles, not menu labels:
 * "Auto Glass Repair Hillsboro OR | Collision Auto Glass". Correct in a
 * <title> tag, three wrapped lines in a footer column, and four of them turn
 * the column into a wall.
 *
 * DERIVED, NOT STORED, so every page already captured is fixed without
 * anybody editing it — and overridable, because no rule of this kind gets
 * every title right. `ClientPage.navLabel` wins when it is set.
 *
 * The steps, in order, each undoing a convention these titles share:
 *
 *  1. Everything after the first separator is the tail an SEO title appends —
 *     the brand, the region, the pitch. The first segment is the subject.
 *  2. The shop's own name, wherever it sits: the visitor is on their site.
 *  3. A leading "Auto Glass", for the same reason — every page on an auto
 *     glass site is about auto glass, so it is the one word carrying no
 *     information here.
 *  4. A trailing state or state code: the whole site is in one state.
 *
 * Falls back to the full title whenever the steps leave too little to be a
 * label. Losing the word that identified the page is worse than a long link.
 */
export function shortLabel(title: string, businessName?: string | null): string {
  const full = (title || '').trim()
  if (!full) return ''

  // The heading, then one more cut a heading should not make: a leading
  // "Auto Glass". Every page on an auto glass site is about auto glass, so in
  // this menu it is the one phrase carrying no information — but it belongs in
  // the H1, where a search engine reads it.
  // NOT split on a colon. "Auto Glass: Tualatin, Tigard & Lake Oswego" puts
  // the subject AFTER the colon, so taking the first half left "Auto Glass",
  // which the next line then removed entirely — and the whole label fell back
  // to the untouched title. That page was live in the footer, three lines
  // long, when the rest of the list was already short.
  let label = stripSeoTail(full, businessName)
  label = stripSalesWords(label)
  // A leading "Auto Glass" only comes off when there is still a subject
  // underneath it. "Auto Glass Repair Hillsboro" is a page about Hillsboro
  // and reads fine as "Repair Hillsboro"; "Auto Glass Repair" is a page about
  // auto glass repair, and cutting it to "Repair" names nothing — next to
  // "Back Glass Repair" and "Car Window Repair" in the same menu it is the
  // one label a visitor cannot tell apart from the others.
  const withoutPrefix = label.replace(/^auto\s+glass\b[\s:,-]*/i, '').trim()
  if (withoutPrefix && withoutPrefix.split(/\s+/).length >= 2) label = withoutPrefix
  label = stripStateTail(label)
  label = label.replace(/^[\s,:—–-]+|[\s,:—–-]+$/g, '').replace(/\s+/g, ' ')

  // Too little left to name a page — the rules ate the subject.
  if (label.length < 3) return full

  // A label nobody can scan is not a label. Cut on a word boundary; the
  // ellipsis is there so a truncated link reads as truncated rather than as
  // a page with an odd name.
  const MAX = 34
  if (label.length > MAX) {
    let cut = label.slice(0, MAX)
    // Only back up to the last space when the cut lands INSIDE a word. When
    // the next character is a space the first MAX characters already end on a
    // boundary, and backing up anyway threw away a word that fitted exactly.
    if (label[MAX] !== ' ') {
      const space = cut.lastIndexOf(' ')
      if (space > 12) cut = cut.slice(0, space)
    }
    label = `${cut.replace(/[\s,:—–-]+$/, '')}…`
  }
  return label
}

export async function keptPagesFor(
  clientId: string,
  businessName?: string | null
): Promise<KeptPageLink[]> {
  const rows = await prisma.clientPage
    .findMany({
      where: { clientId, publishedAt: { not: null } },
      select: { path: true, title: true, navLabel: true },
      orderBy: { title: 'asc' },
      take: 8,
    })
    .catch(() => [])
  return rows.map((r) => ({
    path: r.path,
    title: r.navLabel?.trim() || shortLabel(r.title, businessName),
  }))
}
