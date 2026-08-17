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

export async function keptPagesFor(clientId: string): Promise<KeptPageLink[]> {
  const rows = await prisma.clientPage
    .findMany({
      where: { clientId, publishedAt: { not: null } },
      select: { path: true, title: true },
      orderBy: { title: 'asc' },
      take: 8,
    })
    .catch(() => [])
  return rows.map((r) => ({ path: r.path, title: r.title }))
}
