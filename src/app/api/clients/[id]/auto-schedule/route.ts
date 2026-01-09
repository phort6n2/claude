import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPAACombinationStatus } from '@/lib/automation/paa-selector'
import { getLocationRotationStatus } from '@/lib/automation/location-rotator'
import { DAY_PAIRS, TIME_SLOTS, assignSlotToClient, getSchedulingCapacity } from '@/lib/automation/auto-scheduler'
import type { DayPairKey, TimeSlotIndex } from '@/lib/automation/auto-scheduler'

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
        scheduleDayPair: true,
        scheduleTimeSlot: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get PAA + Location combination status
    const combinationStatus = await getPAACombinationStatus(id)

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

    // Get scheduling capacity
    const capacity = await getSchedulingCapacity()

    // Build slot info
    const dayPair = client.scheduleDayPair as DayPairKey | null
    const timeSlot = client.scheduleTimeSlot as TimeSlotIndex | null

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
      slot: {
        dayPair: dayPair,
        dayPairLabel: dayPair ? DAY_PAIRS[dayPair]?.label : null,
        timeSlot: timeSlot,
        timeSlotLabel: timeSlot !== null ? TIME_SLOTS[timeSlot] : null,
      },
      capacity: {
        total: capacity.totalSlots,
        used: capacity.usedSlots,
        available: capacity.availableSlots,
      },
      paaQueue: {
        // Now shows combinations (PAAs × Locations) instead of just PAAs
        unused: combinationStatus.remainingCombinations,
        total: combinationStatus.totalCombinations,
        isRecycling: combinationStatus.isRecycling,
        custom: { unused: combinationStatus.customPaas, total: combinationStatus.customPaas },
        standard: { unused: combinationStatus.standardPaas, total: combinationStatus.standardPaas },
        // Additional detail
        totalPaas: combinationStatus.totalPaas,
        totalLocations: combinationStatus.totalLocations,
        usedCombinations: combinationStatus.usedCombinations,
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
        scheduleDayPair: true,
        scheduleTimeSlot: true,
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

    const newEnabled = data.enabled ?? existing.autoScheduleEnabled

    // If enabling and no slot assigned, auto-assign one
    let slotAssignment = null
    if (newEnabled && !existing.scheduleDayPair) {
      slotAssignment = await assignSlotToClient(id)
    }

    const updated = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        autoScheduleEnabled: true,
        autoScheduleFrequency: true,
        lastAutoScheduledAt: true,
        scheduleDayPair: true,
        scheduleTimeSlot: true,
      },
    })

    // Apply remaining updates
    const finalUpdated = await prisma.client.update({
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
        scheduleDayPair: true,
        scheduleTimeSlot: true,
      },
    })

    const dayPair = finalUpdated.scheduleDayPair as DayPairKey | null
    const timeSlot = finalUpdated.scheduleTimeSlot as TimeSlotIndex | null

    return NextResponse.json({
      success: true,
      client: {
        id: finalUpdated.id,
        businessName: finalUpdated.businessName,
      },
      automation: {
        enabled: finalUpdated.autoScheduleEnabled,
        frequency: finalUpdated.autoScheduleFrequency,
        lastScheduledAt: finalUpdated.lastAutoScheduledAt,
      },
      slot: {
        dayPair: dayPair,
        dayPairLabel: dayPair ? DAY_PAIRS[dayPair]?.label : null,
        timeSlot: timeSlot,
        timeSlotLabel: timeSlot !== null ? TIME_SLOTS[timeSlot] : null,
        justAssigned: slotAssignment !== null,
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
