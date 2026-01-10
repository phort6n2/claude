import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

// Extended type for GoogleAdsConfig with new OAuth fields
interface GoogleAdsConfigExtended {
  id: string
  mccCustomerId: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: Date | null
  developerToken: string | null
  oauthClientId?: string | null
  oauthClientSecret?: string | null
  isConnected: boolean
  lastSyncAt: Date | null
  lastError: string | null
}

/**
 * GET /api/integrations/google-ads/status
 * Get Google Ads connection status
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await prisma.googleAdsConfig.findFirst() as GoogleAdsConfigExtended | null

    if (!config) {
      return NextResponse.json({
        connected: false,
        mccCustomerId: null,
        developerToken: false,
        oauthClientId: false,
        oauthClientSecret: false,
      })
    }

    return NextResponse.json({
      connected: config.isConnected,
      mccCustomerId: config.mccCustomerId,
      developerToken: !!config.developerToken,
      oauthClientId: !!config.oauthClientId,
      oauthClientSecret: !!config.oauthClientSecret,
      lastSyncAt: config.lastSyncAt,
      lastError: config.lastError,
    })
  } catch (error) {
    console.error('Failed to get Google Ads status:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/integrations/google-ads/status
 * Update Google Ads configuration (MCC ID, developer token, OAuth credentials)
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await request.json()

  try {
    const updateData: Record<string, unknown> = {}

    if (data.mccCustomerId !== undefined) {
      // Validate format (xxx-xxx-xxxx or 10 digits)
      const cleaned = data.mccCustomerId.replace(/-/g, '')
      if (cleaned && !/^\d{10}$/.test(cleaned)) {
        return NextResponse.json(
          { error: 'Invalid MCC Customer ID format. Use xxx-xxx-xxxx format.' },
          { status: 400 }
        )
      }
      updateData.mccCustomerId = data.mccCustomerId || null
    }

    if (data.developerToken !== undefined && data.developerToken) {
      updateData.developerToken = encrypt(data.developerToken)
    }

    if (data.oauthClientId !== undefined && data.oauthClientId) {
      updateData.oauthClientId = encrypt(data.oauthClientId)
    }

    if (data.oauthClientSecret !== undefined && data.oauthClientSecret) {
      updateData.oauthClientSecret = encrypt(data.oauthClientSecret)
    }

    const config = await prisma.googleAdsConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...updateData,
      },
      update: updateData,
    }) as GoogleAdsConfigExtended

    return NextResponse.json({
      success: true,
      connected: config.isConnected,
      mccCustomerId: config.mccCustomerId,
      developerToken: !!config.developerToken,
      oauthClientId: !!config.oauthClientId,
      oauthClientSecret: !!config.oauthClientSecret,
    })
  } catch (error) {
    console.error('Failed to update Google Ads config:', error)
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/integrations/google-ads/status
 * Disconnect Google Ads
 */
export async function DELETE() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await prisma.googleAdsConfig.updateMany({
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        isConnected: false,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to disconnect Google Ads:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    )
  }
}
