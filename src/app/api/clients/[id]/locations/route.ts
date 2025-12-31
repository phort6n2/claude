import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/locations - Get client service locations
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const locations = await prisma.serviceLocation.findMany({
    where: { clientId: id },
    orderBy: [{ isHeadquarters: 'desc' }, { city: 'asc' }],
    include: {
      _count: {
        select: { contentItems: true },
      },
    },
  })

  return NextResponse.json(locations)
}

/**
 * POST /api/clients/[id]/locations - Add a service location
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { city, state, neighborhood, isHeadquarters } = body

    if (!city || !state) {
      return NextResponse.json(
        { error: 'city and state are required' },
        { status: 400 }
      )
    }

    // Check client exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // If setting as headquarters, unset existing headquarters
    if (isHeadquarters) {
      await prisma.serviceLocation.updateMany({
        where: { clientId: id, isHeadquarters: true },
        data: { isHeadquarters: false },
      })
    }

    const location = await prisma.serviceLocation.create({
      data: {
        clientId: id,
        city,
        state,
        neighborhood: neighborhood || null,
        isHeadquarters: isHeadquarters || false,
      },
    })

    return NextResponse.json(location, { status: 201 })
  } catch (error) {
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Location already exists for this client' },
        { status: 409 }
      )
    }

    console.error('Failed to create location:', error)
    return NextResponse.json(
      { error: 'Failed to create location' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/clients/[id]/locations - Bulk update locations
 * Body: { locations: Array<{ city, state, neighborhood?, isHeadquarters? }> }
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { locations } = body

    if (!Array.isArray(locations)) {
      return NextResponse.json(
        { error: 'locations must be an array' },
        { status: 400 }
      )
    }

    // Check client exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Delete locations without content (can be recreated)
    await prisma.serviceLocation.deleteMany({
      where: {
        clientId: id,
        contentItems: { none: {} },
      },
    })

    // Create or update each location
    for (const loc of locations as Array<{ city: string; state: string; neighborhood?: string; isHeadquarters?: boolean }>) {
      const neighborhoodValue = loc.neighborhood?.trim() || null

      // Find existing location
      const existing = await prisma.serviceLocation.findFirst({
        where: {
          clientId: id,
          city: loc.city,
          state: loc.state,
          neighborhood: neighborhoodValue,
        },
      })

      if (existing) {
        await prisma.serviceLocation.update({
          where: { id: existing.id },
          data: {
            isHeadquarters: loc.isHeadquarters || false,
            isActive: true,
          },
        })
      } else {
        await prisma.serviceLocation.create({
          data: {
            clientId: id,
            city: loc.city,
            state: loc.state,
            neighborhood: neighborhoodValue,
            isHeadquarters: loc.isHeadquarters || false,
          },
        })
      }
    }

    // Fetch updated locations
    const updated = await prisma.serviceLocation.findMany({
      where: { clientId: id },
      orderBy: [{ isHeadquarters: 'desc' }, { city: 'asc' }],
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update locations:', error)
    return NextResponse.json(
      { error: 'Failed to update locations' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/clients/[id]/locations - Delete a location
 * Query: ?locationId=xxx
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const locationId = request.nextUrl.searchParams.get('locationId')

  if (!locationId) {
    return NextResponse.json(
      { error: 'locationId query parameter is required' },
      { status: 400 }
    )
  }

  try {
    // Check location exists and belongs to client
    const location = await prisma.serviceLocation.findFirst({
      where: { id: locationId, clientId: id },
      include: {
        _count: { select: { contentItems: true } },
      },
    })

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // If has content, deactivate instead of delete
    if (location._count.contentItems > 0) {
      await prisma.serviceLocation.update({
        where: { id: locationId },
        data: { isActive: false },
      })

      return NextResponse.json({
        message: 'Location deactivated (has associated content)',
        deactivated: true,
      })
    }

    await prisma.serviceLocation.delete({
      where: { id: locationId },
    })

    return NextResponse.json({ message: 'Location deleted' })
  } catch (error) {
    console.error('Failed to delete location:', error)
    return NextResponse.json(
      { error: 'Failed to delete location' },
      { status: 500 }
    )
  }
}
