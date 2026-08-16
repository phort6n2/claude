import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH — clear an article for a shop's site, take it back down, or move it
 * to the right shop.
 *
 * Publishing is deliberately allowed while flags are still set: the flags are
 * a prompt to read the article, not a verdict on it. A shop that really does
 * offer a lifetime warranty on its terms should be able to say so, and the
 * flag stays on the row afterwards as the record of what was checked.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const existing = await prisma.seoArticle
    .findUnique({ where: { id }, select: { id: true, clientId: true, publishedAt: true } })
    .catch(() => null)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: { clientId?: string | null; publishedAt?: Date | null } = {}

  if ('clientId' in body) {
    const clientId = body.clientId ? String(body.clientId) : null
    if (clientId) {
      const client = await prisma.client
        .findUnique({ where: { id: clientId }, select: { id: true } })
        .catch(() => null)
      if (!client) return NextResponse.json({ error: 'No such client' }, { status: 400 })
    }
    data.clientId = clientId
    // An article with no shop cannot be live anywhere.
    if (!clientId) data.publishedAt = null
  }

  if ('published' in body) {
    const wantsPublished = !!body.published
    const clientId = data.clientId !== undefined ? data.clientId : existing.clientId
    if (wantsPublished && !clientId) {
      return NextResponse.json(
        { error: 'Assign this article to a shop before publishing it.' },
        { status: 400 }
      )
    }
    data.publishedAt = wantsPublished ? (existing.publishedAt ?? new Date()) : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  try {
    const article = await prisma.seoArticle.update({
      where: { id },
      data,
      select: { id: true, clientId: true, publishedAt: true },
    })
    return NextResponse.json({ success: true, article })
  } catch {
    // The (clientId, slug) unique index is the realistic failure: two
    // articles written for one shop under the same slug.
    return NextResponse.json(
      { error: 'Could not save — another article for that shop already uses this slug.' },
      { status: 409 }
    )
  }
}
