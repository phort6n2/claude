import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import { sendOfflineConversion, sendEnhancedConversion } from '@/lib/google-ads'

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
    // First verify this lead belongs to the client and get client timezone
    const existing = await prisma.lead.findFirst({
      where: {
        id,
        clientId: session.clientId,
      },
      include: {
        client: {
          select: { timezone: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const clientTimezone = existing.client?.timezone || 'America/Denver'

    // Build update data - clients can only update certain fields
    const updateData: Record<string, unknown> = {}

    // Contact info updates (for phone leads that need info filled in)
    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName
    }
    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName
    }
    if (data.email !== undefined) {
      updateData.email = data.email
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone
    }

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
      if (data.saleDate) {
        // Check if it's a date-only string (YYYY-MM-DD format)
        // Date-only strings are interpreted as UTC by JavaScript, which causes timezone issues
        // Instead, parse as noon in the client's timezone to ensure the date is correct
        const dateOnlyMatch = data.saleDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (dateOnlyMatch) {
          const [, year, month, day] = dateOnlyMatch
          // Get timezone offset for the client's timezone
          const tzOffset = new Date().toLocaleString('en-US', {
            timeZone: clientTimezone,
            timeZoneName: 'shortOffset'
          })
          const offsetMatch = tzOffset.match(/GMT([+-]\d+)/)
          const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0
          // Create date at noon in the client's timezone (converted to UTC)
          // Using noon avoids any date boundary issues
          updateData.saleDate = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            12 - offsetHours,
            0,
            0
          ))
        } else {
          // Full ISO timestamp - parse directly
          updateData.saleDate = new Date(data.saleDate)
        }
      } else {
        updateData.saleDate = null
      }
    }
    if (data.saleNotes !== undefined) {
      updateData.saleNotes = data.saleNotes
    }

    // Vehicle/service info - merge into formData
    if (
      data.vehicleYear !== undefined ||
      data.vehicleMake !== undefined ||
      data.vehicleModel !== undefined ||
      data.interestedIn !== undefined
    ) {
      const existingFormData = (existing.formData as Record<string, unknown>) || {}
      const updatedFormData = { ...existingFormData }

      if (data.vehicleYear !== undefined) {
        updatedFormData.vehicle_year = data.vehicleYear
      }
      if (data.vehicleMake !== undefined) {
        updatedFormData.vehicle_make = data.vehicleMake
      }
      if (data.vehicleModel !== undefined) {
        updatedFormData.vehicle_model = data.vehicleModel
      }
      if (data.interestedIn !== undefined) {
        updatedFormData.interested_in = data.interestedIn
      }

      updateData.formData = updatedFormData
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
        source: true,
        saleValue: true,
        saleDate: true,
        saleNotes: true,
        formData: true,
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

          // Send the offline conversion (sale value)
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

            // Also send enhanced conversion with email/phone for better matching
            const leadEmail = updated.email || data.email
            const leadPhone = updated.phone || data.phone

            if (leadEmail || leadPhone) {
              const enhancedResult = await sendEnhancedConversion({
                customerId: googleAdsConfig.customerId,
                gclid: updated.gclid,
                email: leadEmail || undefined,
                phone: leadPhone || undefined,
                conversionAction: googleAdsConfig.saleConversionActionId,
                conversionDateTime: new Date(conversionDate),
                conversionValue,
              })

              if (enhancedResult.success) {
                console.log(`[Portal] Enhanced conversion sent for lead ${id}`)
              } else {
                console.warn(`[Portal] Enhanced conversion failed for lead ${id}:`, enhancedResult.error)
              }
            }
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
