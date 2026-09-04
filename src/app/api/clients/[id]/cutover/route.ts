import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { normalisePath, hostedPathsFor } from '@/lib/url-parity'
import { readPathOverrides, pathOverrideProblem } from '@/lib/site-paths'
import type { ServiceFlag } from '@/lib/site-services'
import { capturePage } from '@/lib/page-capture'
import { splitKeptSections, dropKeptSections } from '@/lib/kept-content'
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

  const [redirects, pages, client] = await Promise.all([
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
          navLabel: true,
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
    prisma.client
      .findUnique({ where: { id }, select: { pathOverrides: true } })
      .catch(() => null),
  ])
  // The section breakdown travels with the list. Splitting the same HTML in
  // the browser would be a second copy of the rule, and the trim action below
  // addresses sections by index — the two have to agree or a trim removes the
  // wrong piece.
  return NextResponse.json({
    redirects,
    // Template pages already moved onto an old address, as
    // { "/car-window-repair": "/side-window-replacement" } — keyed by the
    // address the operator is looking at, which is the way round the report
    // reads them.
    moved: Object.fromEntries(
      Object.entries(readPathOverrides(client?.pathOverrides)).map(([template, custom]) => [
        custom,
        template,
      ])
    ),
    pages: pages.map((p) => ({ ...p, sections: splitKeptSections(p.bodyHtml || '') })),
  })
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

  /**
   * MOVE an existing template page onto this old address.
   *
   * The third answer to "what happens to this URL", and the best one when the
   * new site already has the same page under a different name: the shop's old
   * /car-window-repair becomes the address of our side-window page. No
   * redirect hop on a paid click, no new address whose history starts today —
   * the page simply lives where their links, their ranking and their ads
   * already point.
   *
   * `to` is the TEMPLATE path being moved. It is stored the other way round
   * (template → old address) because that is the direction every link, the
   * canonical and the sitemap need to look it up.
   */
  if (action === 'rename') {
    const templatePath = typeof body?.to === 'string' ? normalisePath(body.to) : ''
    if (!templatePath) return NextResponse.json({ error: 'Need the page to move.' }, { status: 400 })

    const full = await prisma.client.findUnique({ where: { id } })
    if (!full) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const shopCities = await prisma.clientLocation
      .findMany({ where: { clientId: id }, select: { city: true } })
      .catch(() => [])
    const overrides = readPathOverrides(full.pathOverrides)
    const hosted = hostedPathsFor({
      serviceAreas: full.serviceAreas || [],
      shopCities: shopCities.map((s) => s.city),
      flags: full as unknown as Record<ServiceFlag, boolean>,
      // Deliberately WITHOUT the current overrides: `hosted` is used to check
      // the template page exists and that the new address is not already a
      // page, and both questions are about the template's own shape.
    })
    if (!hosted.includes(templatePath)) {
      return NextResponse.json(
        { error: `${templatePath} is not a page this site builds, so there is nothing to move.` },
        { status: 400 }
      )
    }
    const problem = pathOverrideProblem(
      fromPath,
      templatePath,
      hosted.filter((p) => p !== templatePath)
    )
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    const existingPage = await prisma.clientPage
      .findFirst({ where: { clientId: id, path: fromPath } })
      .catch(() => null)
    if (existingPage) {
      return NextResponse.json(
        { error: 'A kept page already answers on that address, and it wins. Delete it first.' },
        { status: 409 }
      )
    }
    const clash = Object.entries(overrides).find(
      ([canonical, custom]) => custom === fromPath && canonical !== templatePath
    )
    if (clash) {
      return NextResponse.json(
        { error: `${fromPath} is already where ${clash[0]} lives.` },
        { status: 409 }
      )
    }

    await prisma.client.update({
      where: { id },
      data: { pathOverrides: { ...overrides, [templatePath]: fromPath } },
    })
    // A redirect for the same address would be a rule that can never fire —
    // the page answers there now.
    await prisma.clientRedirect.deleteMany({ where: { clientId: id, fromPath } }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: `${templatePath} now lives at ${fromPath}. Every link, the sitemap and the canonical use the new address, and ${templatePath} sends its traffic there.`,
    })
  }

  /** Undo a move: the page goes back to its template address. */
  if (action === 'unrename') {
    const full = await prisma.client.findUnique({ where: { id }, select: { pathOverrides: true } })
    const overrides = readPathOverrides(full?.pathOverrides)
    const entry = Object.entries(overrides).find(([, custom]) => custom === fromPath)
    if (!entry) return NextResponse.json({ error: 'No page is moved to there.' }, { status: 404 })
    const next = { ...overrides }
    delete next[entry[0]]
    await prisma.client.update({ where: { id }, data: { pathOverrides: next } })
    return NextResponse.json({
      success: true,
      message: `${entry[0]} is back at its own address. ${fromPath} now 404s unless you redirect it.`,
    })
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
    const data: {
      title?: string
      navLabel?: string | null
      metaDescription?: string | null
      bodyHtml?: string | null
    } = {}
    if (typeof body?.title === 'string' && body.title.trim()) data.title = body.title.trim()
    // Empty clears the override and puts the derived label back, which is the
    // only way to undo a bad one.
    if (typeof body?.navLabel === 'string') data.navLabel = body.navLabel.trim() || null
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

  if (action === 'trim') {
    const drop: number[] = Array.isArray(body?.drop)
      ? body.drop.filter((n: unknown) => Number.isInteger(n)).map(Number)
      : []
    if (drop.length === 0) return NextResponse.json({ error: 'Nothing to remove.' }, { status: 400 })
    const existing = await prisma.clientPage
      .findFirst({ where: { clientId: id, path: fromPath }, select: { bodyHtml: true } })
      .catch(() => null)
    if (!existing) return NextResponse.json({ error: 'No page there.' }, { status: 404 })
    const before = splitKeptSections(existing.bodyHtml || '').length
    const next = dropKeptSections(existing.bodyHtml || '', drop)
    const after = splitKeptSections(next).length
    // Counted, not assumed. An index that is not there removes nothing, and
    // reporting the number ASKED FOR would say "Removed 1 section" to somebody
    // whose page is unchanged.
    const removed = before - after
    if (removed === 0) {
      return NextResponse.json({ error: 'Nothing matched — the page is unchanged.' }, { status: 400 })
    }
    await prisma.clientPage.updateMany({
      where: { clientId: id, path: fromPath },
      data: { bodyHtml: next || null },
    })
    return NextResponse.json({
      success: true,
      message: `Removed ${removed} section${removed === 1 ? '' : 's'}.`,
    })
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
