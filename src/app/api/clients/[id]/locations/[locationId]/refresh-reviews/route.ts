import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { refreshLocationGbpReviews } from '@/lib/gbp-reviews'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; locationId: string }>
}

/**
 * POST /api/clients/[id]/locations/[locationId]/refresh-reviews
 *
 * Pulls this one shop's Business Profile rating. Subject to the same 168-hour
 * floor as the client-level refresh — the button asks, the floor decides.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, locationId } = await params
  // The location must belong to the client in the URL; otherwise an id from
  // one client's page could refresh another client's shop.
  const owned = await prisma.clientLocation.findFirst({
    where: { id: locationId, clientId: id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const result = await refreshLocationGbpReviews(locationId)
  return NextResponse.json(result, { status: result.ok || result.rateLimited ? 200 : 400 })
}
