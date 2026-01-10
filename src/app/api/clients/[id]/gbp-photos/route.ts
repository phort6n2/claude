import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getClientPhotos, refreshClientPhotos, isGBPConnected } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/gbp-photos
 * Get cached photos from GBP profile
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if Google is connected
    const connected = await isGBPConnected(id)
    if (!connected) {
      return NextResponse.json({
        photos: [],
        isConnected: false,
        message: 'Google account not connected',
      })
    }

    // Get cached photos (will refresh if stale)
    const photos = await getClientPhotos(id)

    // Get last fetch time
    const config = await prisma.gBPPostConfig.findUnique({
      where: { clientId: id },
      select: { photosLastFetched: true },
    })

    return NextResponse.json({
      photos,
      isConnected: true,
      photosLastFetched: config?.photosLastFetched,
      count: photos.length,
    })
  } catch (error) {
    console.error('Failed to get GBP photos:', error)
    return NextResponse.json({ error: 'Failed to get photos' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/gbp-photos
 * Force refresh photos from GBP
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if Google is connected
    const connected = await isGBPConnected(id)
    if (!connected) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      )
    }

    // Force refresh photos
    const photos = await refreshClientPhotos(id)

    return NextResponse.json({
      photos,
      count: photos.length,
      refreshedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to refresh GBP photos:', error)
    return NextResponse.json({ error: 'Failed to refresh photos' }, { status: 500 })
  }
}
