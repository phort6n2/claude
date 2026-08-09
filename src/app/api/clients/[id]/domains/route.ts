import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { attachDomain, checkDomain, detachDomain, normalizeDomain } from '@/lib/custom-domains'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET — the client's domains with their last known status. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  try {
    const domains = await prisma.clientDomain.findMany({
      where: { clientId: id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ domains })
  } catch {
    return NextResponse.json({ domains: [], unavailable: true })
  }
}

/**
 * POST — add a domain: attach it to the Vercel project and record it.
 *
 * The row is written only after Vercel accepts the domain. A row that exists
 * for a domain Vercel doesn't know about would show DNS instructions for a
 * hostname that can never resolve here.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const normalized = normalizeDomain(typeof body.domain === 'string' ? body.domain : '')
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 })
  const { domain } = normalized

  try {
    const taken = await prisma.clientDomain.findUnique({
      where: { domain },
      select: { clientId: true },
    })
    if (taken && taken.clientId !== id) {
      return NextResponse.json(
        { error: 'That domain is already assigned to another client.' },
        { status: 409 }
      )
    }

    const attached = await attachDomain(domain)
    if (!attached.ok) return NextResponse.json({ error: attached.error }, { status: 400 })

    const status = await checkDomain(domain)
    const existingCount = await prisma.clientDomain.count({ where: { clientId: id } })

    await prisma.clientDomain.upsert({
      where: { domain },
      update: {
        verified: status.verified,
        misconfigured: status.misconfigured,
        lastCheckedAt: new Date(),
        lastError: status.error,
      },
      create: {
        clientId: id,
        domain,
        // The first domain a client adds is the one their canonical URLs
        // should use; there is nothing else it could be.
        isPrimary: existingCount === 0,
        verified: status.verified,
        misconfigured: status.misconfigured,
        lastCheckedAt: new Date(),
        lastError: status.error,
      },
    })

    revalidatePath(`/sites/${client.slug}`, 'layout')
    return NextResponse.json({ status })
  } catch (error) {
    console.error('Failed to add domain:', error)
    return NextResponse.json(
      {
        error:
          'Could not add the domain. If this is a fresh deploy, the ClientDomain table may not exist yet — run /api/admin/setup-db.',
      },
      { status: 503 }
    )
  }
}

/** DELETE ?domain=… — detach from Vercel and forget it. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const domain = (new URL(request.url).searchParams.get('domain') || '').toLowerCase()
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 })

  const row = await prisma.clientDomain.findFirst({ where: { domain, clientId: id } })
  if (!row) return NextResponse.json({ error: 'Domain not found for this client' }, { status: 404 })

  const detached = await detachDomain(domain)
  if (!detached.ok) return NextResponse.json({ error: detached.error }, { status: 400 })

  await prisma.clientDomain.delete({ where: { id: row.id } })

  // Removing the primary leaves the client with no canonical host, so the
  // oldest survivor takes over rather than leaving the choice unmade.
  if (row.isPrimary) {
    const next = await prisma.clientDomain.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'asc' },
    })
    if (next) await prisma.clientDomain.update({ where: { id: next.id }, data: { isPrimary: true } })
  }

  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}

/** PATCH — re-check status, or set which domain is primary. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const domain = (typeof body.domain === 'string' ? body.domain : '').toLowerCase()
  const row = await prisma.clientDomain.findFirst({ where: { domain, clientId: id } })
  if (!row) return NextResponse.json({ error: 'Domain not found for this client' }, { status: 404 })

  if (body.action === 'primary') {
    await prisma.$transaction([
      prisma.clientDomain.updateMany({ where: { clientId: id }, data: { isPrimary: false } }),
      prisma.clientDomain.update({ where: { id: row.id }, data: { isPrimary: true } }),
    ])
    const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
    if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
    return NextResponse.json({ ok: true })
  }

  // Default: ask Vercel again. This is the button an operator presses after
  // adding the DNS records.
  const status = await checkDomain(domain)
  await prisma.clientDomain.update({
    where: { id: row.id },
    data: {
      verified: status.verified,
      misconfigured: status.misconfigured,
      lastCheckedAt: new Date(),
      lastError: status.error,
    },
  })
  return NextResponse.json({ status })
}
