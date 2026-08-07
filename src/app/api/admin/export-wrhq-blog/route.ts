import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-off export of the WRHQ blog archive.
 *
 * These ~100 articles were published to the old WordPress windshieldrepairhq.com,
 * which the Next.js directory replaced. Their URLs now 301 to the generic /blog
 * index, so Google sees a hundred distinct pages collapsing onto one listing —
 * read as a soft 404, and the rankings drain away. This pulls the content out so
 * it can be restored in the directory repo at matching slugs, with per-article
 * redirects.
 *
 * Deliberately temporary. Delete this route once the migration has run — it
 * exists to move data across a gap the two apps no longer share, not as an API.
 *
 * Auth: Bearer token in WRHQ_EXPORT_TOKEN. The content itself was public on a
 * live website, so the token guards against incidental scraping and load rather
 * than protecting a secret. Without the env var set the route refuses outright
 * rather than defaulting to open.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.WRHQ_EXPORT_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: 'WRHQ_EXPORT_TOKEN is not configured on this deployment.' },
      { status: 503 }
    )
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.nextUrl.searchParams.get('token') ??
    ''

  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Paged so a large archive can't blow the response size or the function's
  // memory in one go. `cursor` is the last id from the previous page.
  const take = Math.min(Number(request.nextUrl.searchParams.get('take') ?? 25), 50)
  const cursor = request.nextUrl.searchParams.get('cursor')

  const posts = await withRetry(() =>
    prisma.wRHQBlogPost.findMany({
      take: take + 1, // one extra to detect whether another page exists
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        excerpt: true,
        metaTitle: true,
        metaDescription: true,
        focusKeyword: true,
        featuredImageUrl: true,
        wordCount: true,
        publishedAt: true,
        wordpressUrl: true,
        createdAt: true,
      },
    })
  )

  const hasMore = posts.length > take
  const page = hasMore ? posts.slice(0, take) : posts

  return NextResponse.json({
    count: page.length,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
    posts: page,
  })
}
