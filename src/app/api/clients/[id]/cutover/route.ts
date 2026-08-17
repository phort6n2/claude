import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { normalisePath } from '@/lib/url-parity'
import { capturePage } from '@/lib/page-capture'
import { validatePublicUrl } from '@/lib/site-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET — what is already set up for this shop. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params

  const [redirects, pages] = await Promise.all([
    prisma.clientRedirect
      .findMany({ where: { clientId: id }, orderBy: { fromPath: 'asc' } })
      .catch(() => []),
    prisma.clientPage
      .findMany({
        where: { clientId: id },
        orderBy: { path: 'asc' },
        select: {
          id: true,
          path: true,
          title: true,
          metaDescription: true,
          // The body comes back with the list on purpose. The whole point of
          // holding a captured page is that somebody reads it before it
          // serves, and a "read it first" workflow that needs a second
          // request to a screen nobody built is how pages get published
          // unread.
          bodyHtml: true,
          publishedAt: true,
          sourceUrl: true,
        },
      })
      .catch(() => []),
  ])
  return NextResponse.json({ redirects, pages })
}

/**
 * POST — decide what happens to one old address.
 *
 * `redirect` sends it somewhere on the new site. `page` keeps it at its own
 * address, pulling the old copy across as a starting point.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body?.action
  const fromPath = typeof body?.from === 'string' ? normalisePath(body.from) : ''

  if (!fromPath || fromPath === '/') {
    return NextResponse.json(
      { error: 'Need the old path, and it cannot be the home page.' },
      { status: 400 }
    )
  }

  const client = await prisma.client
    .findUnique({ where: { id }, select: { id: true, websiteUrl: true } })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'redirect') {
    const toPath = typeof body?.to === 'string' ? normalisePath(body.to) : ''
    if (!toPath) return NextResponse.json({ error: 'Need a destination.' }, { status: 400 })
    if (toPath === fromPath) {
      return NextResponse.json(
        { error: 'That would redirect the address to itself.' },
        { status: 400 }
      )
    }
    // A page at this address wins over a redirect at render time, so leaving
    // both would be a rule that silently never fires. Say so instead.
    const existingPage = await prisma.clientPage
      .findFirst({ where: { clientId: id, path: fromPath } })
      .catch(() => null)
    if (existingPage) {
      return NextResponse.json(
        { error: 'There is a page at that address already. Delete it first, or leave it.' },
        { status: 409 }
      )
    }

    await prisma.clientRedirect.upsert({
      where: { clientId_fromPath: { clientId: id, fromPath } },
      create: { clientId: id, fromPath, toPath },
      update: { toPath },
    })
    return NextResponse.json({ success: true, message: `${fromPath} now goes to ${toPath}.` })
  }

  if (action === 'page') {
    const sourceUrl: string =
      typeof body?.sourceUrl === 'string' && body.sourceUrl
        ? body.sourceUrl
        : client.websiteUrl
          ? new URL(fromPath, validatePublicUrl(client.websiteUrl).ok
              ? (validatePublicUrl(client.websiteUrl) as { ok: true; url: URL }).url.origin
              : 'https://invalid.invalid').toString()
          : ''

    const captured = sourceUrl ? await capturePage(sourceUrl) : null

    const page = await prisma.clientPage.upsert({
      where: { clientId_path: { clientId: id, path: fromPath } },
      create: {
        clientId: id,
        path: fromPath,
        title: captured?.title || fromPath.replace(/^\//, '').replace(/-/g, ' '),
        metaDescription: captured?.metaDescription || null,
        bodyHtml: captured?.bodyHtml || null,
        sourceUrl: sourceUrl || null,
        // HELD. Imported copy is somebody else's words about a real business
        // and can carry claims this platform would not make on their behalf.
        publishedAt: null,
      },
      update: {
        ...(captured?.ok
          ? {
              title: captured.title || undefined,
              metaDescription: captured.metaDescription || null,
              bodyHtml: captured.bodyHtml || null,
            }
          : {}),
        sourceUrl: sourceUrl || null,
      },
    })

    // A redirect for the same address would now be dead rule. Clear it.
    await prisma.clientRedirect
      .deleteMany({ where: { clientId: id, fromPath } })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      pageId: page.id,
      captured: captured?.ok ?? false,
      message: captured?.ok
        ? `${captured.message} It is held until you publish it.`
        : `Page created at ${fromPath}, but nothing could be pulled from the old site${captured ? ` — ${captured.message}` : ''}. Write it in the editor.`,
    })
  }

  if (action === 'edit') {
    const data: { title?: string; metaDescription?: string | null; bodyHtml?: string | null } = {}
    if (typeof body?.title === 'string' && body.title.trim()) data.title = body.title.trim()
    if (typeof body?.metaDescription === 'string')
      data.metaDescription = body.metaDescription.trim() || null
    if (typeof body?.bodyHtml === 'string') data.bodyHtml = body.bodyHtml.trim() || null
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
    }
    const updated = await prisma.clientPage
      .updateMany({ where: { clientId: id, path: fromPath }, data })
      .catch(() => null)
    if (!updated?.count) return NextResponse.json({ error: 'No page there.' }, { status: 404 })
    return NextResponse.json({ success: true, message: 'Saved.' })
  }

  if (action === 'publish' || action === 'unpublish') {
    const updated = await prisma.clientPage
      .updateMany({
        where: { clientId: id, path: fromPath },
        data: { publishedAt: action === 'publish' ? new Date() : null },
      })
      .catch(() => null)
    if (!updated?.count) return NextResponse.json({ error: 'No page there.' }, { status: 404 })
    return NextResponse.json({
      success: true,
      message: action === 'publish' ? `${fromPath} is live.` : `${fromPath} is no longer served.`,
    })
  }

  if (action === 'remove') {
    await prisma.clientRedirect.deleteMany({ where: { clientId: id, fromPath } }).catch(() => {})
    await prisma.clientPage.deleteMany({ where: { clientId: id, path: fromPath } }).catch(() => {})
    return NextResponse.json({ success: true, message: `${fromPath} is back to a 404.` })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
