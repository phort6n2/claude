import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET — every synced article, with what it needs review for.
 *
 * Bodies are not returned. The queue is a triage list; the article itself is
 * read on its own page, and shipping a hundred article bodies to render a
 * list is how a review screen becomes one nobody opens.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const [articles, clients] = await Promise.all([
    prisma.seoArticle
      .findMany({
        orderBy: [{ authoredAt: 'desc' }, { syncedAt: 'desc' }],
        select: {
          id: true,
          externalId: true,
          title: true,
          slug: true,
          excerpt: true,
          seedKeyword: true,
          orgWebsite: true,
          reviewFlags: true,
          publishedAt: true,
          authoredAt: true,
          syncedAt: true,
          clientId: true,
          client: { select: { businessName: true, slug: true, siteSubdomain: true } },
        },
      })
      .catch(() => []),
    prisma.client
      .findMany({
        where: { status: 'ACTIVE' },
        orderBy: { businessName: 'asc' },
        select: { id: true, businessName: true },
      })
      .catch(() => []),
  ])

  return NextResponse.json({ articles, clients })
}
