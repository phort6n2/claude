import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPAAQueueStatus } from '@/lib/automation/paa-selector'
import { getLocationRotationStatus } from '@/lib/automation/location-rotator'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET - Get auto-schedule status and info for a client
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        autoScheduleEnabled: true,
        autoScheduleFrequency: true,
        lastAutoScheduledAt: true,
        preferredPublishTime: true,
        timezone: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get PAA queue status
    const paaStatus = await getPAAQueueStatus(id)

    // Get location rotation status
    const locationStatus = await getLocationRotationStatus(id)

    // Get upcoming scheduled content count
    const upcomingCount = await prisma.contentItem.count({
      where: {
        clientId: id,
        scheduledDate: { gte: new Date() },
        status: { in: ['SCHEDULED', 'GENERATING', 'REVIEW'] },
      },
    })

    return NextResponse.json({
      client: {
        id: client.id,
        businessName: client.businessName,
      },
      automation: {
        enabled: client.autoScheduleEnabled,
        frequency: client.autoScheduleFrequency,
        lastScheduledAt: client.lastAutoScheduledAt,
        publishTime: client.preferredPublishTime,
        timezone: client.timezone,
      },
      paaQueue: {
        unused: paaStatus.unusedCount,
        total: paaStatus.totalCount,
        isRecycling: paaStatus.isRecycling,
      },
      locations: {
        active: locationStatus.activeCount,
        neverUsed: locationStatus.neverUsedCount,
      },
      upcoming: {
        count: upcomingCount,
      },
    })
  } catch (error) {
    console.error('Failed to get auto-schedule status:', error)
    return NextResponse.json(
      { error: 'Failed to get auto-schedule status' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Toggle or update auto-schedule settings
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const data = await request.json()

    const existing = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        autoScheduleEnabled: true,
        autoScheduleFrequency: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Validate frequency if provided
    if (data.frequency !== undefined && ![1, 2].includes(data.frequency)) {
      return NextResponse.json(
        { error: 'Frequency must be 1 or 2' },
        { status: 400 }
      )
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        autoScheduleEnabled: data.enabled ?? existing.autoScheduleEnabled,
        autoScheduleFrequency: data.frequency ?? existing.autoScheduleFrequency,
      },
      select: {
        id: true,
        businessName: true,
        autoScheduleEnabled: true,
        autoScheduleFrequency: true,
        lastAutoScheduledAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      client: {
        id: updated.id,
        businessName: updated.businessName,
      },
      automation: {
        enabled: updated.autoScheduleEnabled,
        frequency: updated.autoScheduleFrequency,
        lastScheduledAt: updated.lastAutoScheduledAt,
      },
    })
  } catch (error) {
    console.error('Failed to update auto-schedule:', error)
    return NextResponse.json(
      { error: 'Failed to update auto-schedule' },
      { status: 500 }
    )
  }
}
