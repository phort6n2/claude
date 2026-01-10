import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import { sendOfflineConversion } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/portal/leads/[id] - Get a single lead (for client portal)
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const lead = await prisma.lead.findFirst({
      where: {
        id,
        clientId: session.clientId, // Ensure client can only see their own leads
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        statusUpdatedAt: true,
        source: true,
        formName: true,
        saleValue: true,
        saleCurrency: true,
        saleDate: true,
        saleNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json(lead)
  } catch (error) {
    console.error('Failed to fetch lead:', error)
    return NextResponse.json(
      { error: 'Failed to fetch lead' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/portal/leads/[id] - Update a lead (status, sale info)
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  try {
    // First verify this lead belongs to the client
    const existing = await prisma.lead.findFirst({
      where: {
        id,
        clientId: session.clientId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Build update data - clients can only update certain fields
    const updateData: Record<string, unknown> = {}

    // Status update
    if (data.status !== undefined) {
      updateData.status = data.status
      updateData.statusUpdatedAt = new Date()
    }

    // Sale info
    if (data.saleValue !== undefined) {
      updateData.saleValue = data.saleValue
    }
    if (data.saleDate !== undefined) {
      updateData.saleDate = data.saleDate ? new Date(data.saleDate) : null
    }
    if (data.saleNotes !== undefined) {
      updateData.saleNotes = data.saleNotes
    }

    // If marking as SOLD and no sale date, set it now
    if (data.status === 'SOLD' && !existing.saleDate && !data.saleDate) {
      updateData.saleDate = new Date()
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        statusUpdatedAt: true,
        saleValue: true,
        saleDate: true,
        saleNotes: true,
        gclid: true,
        offlineConversionSent: true,
      },
    })

    // Send Offline Conversion when marked as SOLD with a sale value
    if (
      data.status === 'SOLD' &&
      updated.gclid &&
      !existing.offlineConversionSent &&
      (updated.saleValue || data.saleValue)
    ) {
      try {
        const googleAdsConfig = await prisma.clientGoogleAds.findUnique({
          where: { clientId: session.clientId },
        })

        if (googleAdsConfig?.isActive && googleAdsConfig.saleConversionActionId) {
          const conversionValue = updated.saleValue || data.saleValue || 0
          const conversionDate = updated.saleDate || new Date()

          const result = await sendOfflineConversion({
            customerId: googleAdsConfig.customerId,
            gclid: updated.gclid,
            conversionAction: googleAdsConfig.saleConversionActionId,
            conversionDateTime: new Date(conversionDate),
            conversionValue,
          })

          if (result.success) {
            await prisma.lead.update({
              where: { id },
              data: { offlineConversionSent: true },
            })
            console.log(`[Portal] Offline conversion sent for lead ${id}`)
          } else {
            console.warn(`[Portal] Offline conversion failed for lead ${id}:`, result.error)
          }
        }
      } catch (err) {
        console.error(`[Portal] Offline conversion error for lead ${id}:`, err)
      }
    }

    // Remove gclid and offlineConversionSent from response
    const { gclid: _g, offlineConversionSent: _o, ...responseData } = updated

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Failed to update lead:', error)
    return NextResponse.json(
      { error: 'Failed to update lead' },
      { status: 500 }
    )
  }
}
