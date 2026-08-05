import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'

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
        callRecordingUrl: true,
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

    // Quote info
    if (data.quoteValue !== undefined) {
      updateData.quoteValue = data.quoteValue
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
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update lead:', error)
    return NextResponse.json(
      { error: 'Failed to update lead' },
      { status: 500 }
    )
  }
}
