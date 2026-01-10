import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import { listAccessibleCustomers } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

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
    const config = await prisma.googleAdsConfig.findFirst()

    if (!config) {
      return NextResponse.json({
        connected: false,
        mccCustomerId: null,
        developerToken: false,
      })
    }

    return NextResponse.json({
      connected: config.isConnected,
      mccCustomerId: config.mccCustomerId,
      developerToken: !!config.developerToken,
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
 * Update Google Ads configuration (MCC ID, developer token)
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

    if (data.developerToken !== undefined) {
      updateData.developerToken = data.developerToken ? encrypt(data.developerToken) : null
    }

    const config = await prisma.googleAdsConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...updateData,
      },
      update: updateData,
    })

    return NextResponse.json({
      success: true,
      connected: config.isConnected,
      mccCustomerId: config.mccCustomerId,
      developerToken: !!config.developerToken,
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
