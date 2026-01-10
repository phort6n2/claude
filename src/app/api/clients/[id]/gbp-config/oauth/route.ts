import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getGBPOAuthUrl, disconnectGBP, testGBPConnection } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/gbp-config/oauth
 * Get OAuth status or initiate OAuth flow
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, businessName: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // If action is 'connect', generate OAuth URL
    if (action === 'connect') {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || ''
      const redirectUri = `${baseUrl}/api/gbp/oauth/callback`

      const oauthUrl = await getGBPOAuthUrl(id, redirectUri, id)

      return NextResponse.json({ oauthUrl })
    }

    // If action is 'test', test the connection
    if (action === 'test') {
      const result = await testGBPConnection(id)
      return NextResponse.json(result)
    }

    // Default: return connection status
    const config = await prisma.gBPPostConfig.findUnique({
      where: { clientId: id },
      select: {
        googleAccountId: true,
        googleTokenExpiry: true,
        photosLastFetched: true,
        cachedPhotos: true,
      },
    })

    const isConnected = !!config?.googleAccountId
    const photoCount = Array.isArray(config?.cachedPhotos) ? config.cachedPhotos.length : 0

    return NextResponse.json({
      isConnected,
      accountId: config?.googleAccountId,
      tokenExpiry: config?.googleTokenExpiry,
      photosLastFetched: config?.photosLastFetched,
      photoCount,
    })
  } catch (error) {
    console.error('GBP OAuth error:', error)
    const errorMessage = error instanceof Error ? error.message : 'OAuth operation failed'

    // Check if the error is about missing OAuth credentials
    if (errorMessage.includes('GBP OAuth not configured')) {
      return NextResponse.json({
        error: 'GBP OAuth not configured. Please add GBP_CLIENT_ID and GBP_CLIENT_SECRET in Settings → API Settings.',
        needsConfiguration: true,
      }, { status: 400 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * DELETE /api/clients/[id]/gbp-config/oauth
 * Disconnect Google account
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    await disconnectGBP(id)

    return NextResponse.json({ success: true, message: 'Google account disconnected' })
  } catch (error) {
    console.error('Failed to disconnect GBP:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
