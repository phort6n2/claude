import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { refreshLocationFromGoogle } from '@/lib/gbp-reviews'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface RouteContext {
  params: Promise<{ id: string; locationId: string }>
}

/**
 * POST /api/clients/[id]/locations/[locationId]/refresh
 *
 * Everything Google knows about this shop, in one press: address, phone,
 * hours, maps link, rating, review count. Rate limited to once a week by the
 * same floor the reviews refresh uses.
 *
 * Separate from .../refresh-reviews, which stays as the narrow rating-only
 * call the weekly cron uses. This one writes fields a human typed, so it is
 * deliberately only ever triggered by a human pressing the button.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id, locationId } = await params
  // The shop must belong to the client in the URL — otherwise an id lifted
  // from one client's page could rewrite another client's address.
  const owned = await prisma.clientLocation.findFirst({
    where: { id: locationId, clientId: id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const result = await refreshLocationFromGoogle(locationId)

  if (result.ok && result.updated?.length) {
    const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
    if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
  }

  return NextResponse.json(result, { status: result.ok || result.rateLimited ? 200 : 400 })
}
