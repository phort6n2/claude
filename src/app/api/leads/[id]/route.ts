import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/leads/[id] - Get a single lead
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            phone: true,
            email: true,
          },
        },
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
 * PATCH /api/leads/[id] - Update a lead (status, sale info, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  try {
    const existing = await prisma.lead.findUnique({
      where: { id },
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

    // Build update data
    const updateData: Record<string, unknown> = {}

    // Contact info updates
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
      // Track who updated (for client portal later)
      if (data.updatedBy) {
        updateData.statusUpdatedBy = data.updatedBy
      }
    }

    // Qualification
    if (data.qualified !== undefined) {
      updateData.qualified = data.qualified
      updateData.qualifiedAt = data.qualified !== null ? new Date() : null
    }
    if (data.qualificationNotes !== undefined) {
      updateData.qualificationNotes = data.qualificationNotes
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

    // If marking as SOLD and no sale date, set it now
    if (data.status === 'SOLD' && !existing.saleDate && !data.saleDate) {
      updateData.saleDate = new Date()
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

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            slug: true,
          },
        },
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

/**
 * DELETE /api/leads/[id] - Delete a lead
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    await prisma.lead.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete lead:', error)
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    )
  }
}
