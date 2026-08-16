import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { checkFeed, discoverFeedUrl, syncContentFeeds } from '@/lib/content-feed'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/** PATCH — set or clear this shop's content feed address. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('contentFeedUrl' in body)) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const raw = typeof body.contentFeedUrl === 'string' ? body.contentFeedUrl.trim() : ''

  // Clearing is allowed and immediate. Setting one is checked first: a feed
  // address that does not answer is worse than none, because the Activity tab
  // then looks like nothing is being published rather than like nothing is
  // configured.
  if (raw) {
    const result = await checkFeed(raw)
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })
  }

  const client = await prisma.client
    .update({
      where: { id },
      data: {
        contentFeedUrl: raw || null,
        contentFeedError: null,
        contentFeedCheckedAt: raw ? new Date() : null,
      },
      select: { contentFeedUrl: true },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Saving a working address should populate the feed immediately — waiting
  // until tomorrow's cron to see anything makes a working save look broken.
  const sync = raw ? await syncContentFeeds(id) : null

  return NextResponse.json({
    success: true,
    contentFeedUrl: client.contentFeedUrl,
    message: raw ? `Saved. ${sync?.message || ''}`.trim() : 'Feed removed.',
  })
}

/**
 * POST — `{ action: 'discover' | 'check' | 'sync' }`.
 *
 * Discover looks at the shop's own website for an advertised feed, so nobody
 * has to know where their CMS puts one.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body?.action

  const client = await prisma.client
    .findUnique({
      where: { id },
      select: { contentFeedUrl: true, websiteUrl: true, domains: { select: { domain: true } } },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'discover') {
    // Their own website first, then any domain pointed at their hosted site.
    const candidates = [client.websiteUrl, ...client.domains.map((d) => d.domain)].filter(
      (c): c is string => !!c
    )
    for (const candidate of candidates) {
      const found = await discoverFeedUrl(candidate)
      if (found) {
        const check = await checkFeed(found)
        return NextResponse.json({
          success: true,
          contentFeedUrl: found,
          message: `Found a feed at ${found}. ${check.message}`,
        })
      }
    }
    return NextResponse.json({
      success: false,
      message: candidates.length
        ? 'No feed advertised on their site, and none at the usual addresses. Paste it by hand if you know where it is.'
        : 'No website on this client to look at. Set their website on the Business tab first.',
    })
  }

  if (!client.contentFeedUrl) {
    return NextResponse.json({ success: false, message: 'No feed set for this shop yet.' })
  }

  if (action === 'check') {
    const result = await checkFeed(client.contentFeedUrl)
    return NextResponse.json({ success: result.ok, message: result.message })
  }

  const result = await syncContentFeeds(id)
  return NextResponse.json({ success: result.ok, message: result.message })
}
