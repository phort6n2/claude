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

/** The state names and abbreviations an SEO title tails off with. */
const STATE_TAIL =
  /[\s,]+(or|wa|ca|ny|tx|fl|az|nv|id|ut|co|mt|oregon|washington|california|nevada|idaho|utah|colorado|montana|arizona)$/i

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
  out = out.replace(STATE_TAIL, '').replace(/\s+/g, ' ').trim()
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
  let label = stripSeoTail(full, businessName).split(/\s*:\s*/)[0].trim()
  label = label.replace(/^auto\s+glass\b[\s:,-]*/i, '').trim()
  label = label.replace(STATE_TAIL, '').trim()
  label = label.replace(/^[\s,:—–-]+|[\s,:—–-]+$/g, '').replace(/\s+/g, ' ')

  // Too little left to name a page — the rules ate the subject.
  if (label.length < 3) return full

  // A label nobody can scan is not a label. Cut on a word boundary; the
  // ellipsis is there so a truncated link reads as truncated rather than as
  // a page with an odd name.
  const MAX = 34
  if (label.length > MAX) {
    const cut = label.slice(0, MAX)
    const space = cut.lastIndexOf(' ')
    label = `${(space > 12 ? cut.slice(0, space) : cut).replace(/[\s,:—–-]+$/, '')}…`
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
