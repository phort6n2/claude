import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface LocationInput {
  id?: string
  city: string
  state: string
  neighborhood?: string
  isHeadquarters?: boolean
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const locations = await prisma.serviceLocation.findMany({
      where: {
        clientId: id,
        isActive: true,
      },
      orderBy: [
        { isHeadquarters: 'desc' },
        { city: 'asc' },
      ],
      select: {
        id: true,
        city: true,
        state: true,
        neighborhood: true,
        isHeadquarters: true,
      },
    })

    return NextResponse.json(locations)
  } catch (error) {
    console.error('Failed to fetch locations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const { locations } = await request.json() as { locations: LocationInput[] }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Get existing locations
    const existingLocations = await prisma.serviceLocation.findMany({
      where: { clientId: id },
    })

    const existingIds = new Set(existingLocations.map(l => l.id))
    const incomingIds = new Set(locations.filter(l => l.id).map(l => l.id))

    // Soft delete locations that are no longer in the list
    const toDeactivate = existingLocations.filter(l => !incomingIds.has(l.id))
    for (const loc of toDeactivate) {
      await prisma.serviceLocation.update({
        where: { id: loc.id },
        data: { isActive: false },
      })
    }

    // Update or create locations
    for (const loc of locations) {
      if (loc.id && existingIds.has(loc.id)) {
        // Update existing location
        await prisma.serviceLocation.update({
          where: { id: loc.id },
          data: {
            city: loc.city,
            state: loc.state,
            neighborhood: loc.neighborhood || null,
            isHeadquarters: loc.isHeadquarters || false,
            isActive: true,
          },
        })
      } else {
        // Create new location
        await prisma.serviceLocation.create({
          data: {
            clientId: id,
            city: loc.city,
            state: loc.state,
            neighborhood: loc.neighborhood || null,
            isHeadquarters: loc.isHeadquarters || false,
            isActive: true,
          },
        })
      }
    }

    // Fetch and return updated locations
    const updatedLocations = await prisma.serviceLocation.findMany({
      where: {
        clientId: id,
        isActive: true,
      },
      orderBy: [
        { isHeadquarters: 'desc' },
        { city: 'asc' },
      ],
      select: {
        id: true,
        city: true,
        state: true,
        neighborhood: true,
        isHeadquarters: true,
      },
    })

    return NextResponse.json(updatedLocations)
  } catch (error) {
    console.error('Failed to update locations:', error)
    return NextResponse.json(
      { error: 'Failed to update locations' },
      { status: 500 }
    )
  }
}
