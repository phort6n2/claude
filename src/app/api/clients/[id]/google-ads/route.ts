import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/google-ads
 * Get client's Google Ads configuration
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const config = await prisma.clientGoogleAds.findUnique({
      where: { clientId: id },
    })

    if (!config) {
      return NextResponse.json({
        connected: false,
        customerId: null,
        formConversionActionId: null,
        callConversionActionId: null,
        saleConversionActionId: null,
      })
    }

    return NextResponse.json({
      connected: true,
      customerId: config.customerId,
      formConversionActionId: config.formConversionActionId,
      callConversionActionId: config.callConversionActionId,
      saleConversionActionId: config.saleConversionActionId,
      isActive: config.isActive,
      lastSyncAt: config.lastSyncAt,
      lastError: config.lastError,
    })
  } catch (error) {
    console.error('Failed to get client Google Ads config:', error)
    return NextResponse.json(
      { error: 'Failed to get configuration' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/clients/[id]/google-ads
 * Set up or update client's Google Ads configuration
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  if (!data.customerId) {
    return NextResponse.json(
      { error: 'Customer ID is required' },
      { status: 400 }
    )
  }

  // Validate customer ID format
  const cleaned = data.customerId.replace(/-/g, '')
  if (!/^\d{10}$/.test(cleaned)) {
    return NextResponse.json(
      { error: 'Invalid Customer ID format. Use xxx-xxx-xxxx format.' },
      { status: 400 }
    )
  }

  try {
    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const config = await prisma.clientGoogleAds.upsert({
      where: { clientId: id },
      create: {
        clientId: id,
        customerId: data.customerId,
        formConversionActionId: data.formConversionActionId || null,
        callConversionActionId: data.callConversionActionId || null,
        saleConversionActionId: data.saleConversionActionId || null,
        isActive: true,
      },
      update: {
        customerId: data.customerId,
        formConversionActionId: data.formConversionActionId || null,
        callConversionActionId: data.callConversionActionId || null,
        saleConversionActionId: data.saleConversionActionId || null,
        lastError: null,
      },
    })

    return NextResponse.json({
      success: true,
      customerId: config.customerId,
      formConversionActionId: config.formConversionActionId,
      callConversionActionId: config.callConversionActionId,
      saleConversionActionId: config.saleConversionActionId,
    })
  } catch (error) {
    console.error('Failed to update client Google Ads config:', error)
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/clients/[id]/google-ads
 * Remove client's Google Ads configuration
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    await prisma.clientGoogleAds.delete({
      where: { clientId: id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    // If not found, that's fine
    return NextResponse.json({ success: true })
  }
}
