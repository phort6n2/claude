import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
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
