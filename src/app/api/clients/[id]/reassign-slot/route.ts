import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findBestSlot, DAY_PAIRS, TIME_SLOTS } from '@/lib/automation/auto-scheduler'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST - Reassign a client's schedule slot
 * Clears current slot and assigns a new non-conflicting one
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: clientId } = await params

    // Get client
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        businessName: true,
        scheduleDayPair: true,
        scheduleTimeSlot: true,
        autoScheduleEnabled: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const oldDayPair = client.scheduleDayPair
    const oldSlot = client.scheduleTimeSlot

    // Temporarily clear the slot so findBestSlot doesn't count this client
    await prisma.client.update({
      where: { id: clientId },
      data: {
        scheduleDayPair: null,
        scheduleTimeSlot: null,
      },
    })

    // Find best available slot
    const newSlot = await findBestSlot()

    // Assign the new slot
    await prisma.client.update({
      where: { id: clientId },
      data: {
        scheduleDayPair: newSlot.dayPair,
        scheduleTimeSlot: newSlot.timeSlot,
      },
    })

    const oldDays = oldDayPair ? DAY_PAIRS[oldDayPair as keyof typeof DAY_PAIRS] : null
    const newDays = DAY_PAIRS[newSlot.dayPair]
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return NextResponse.json({
      success: true,
      client: client.businessName,
      previous: oldDayPair ? {
        dayPair: oldDayPair,
        days: oldDays ? `${dayNames[oldDays.day1]} & ${dayNames[oldDays.day2]}` : null,
        timeSlot: oldSlot,
        time: oldSlot !== null ? TIME_SLOTS[oldSlot] : null,
      } : null,
      new: {
        dayPair: newSlot.dayPair,
        days: `${dayNames[newDays.day1]} & ${dayNames[newDays.day2]}`,
        timeSlot: newSlot.timeSlot,
        time: TIME_SLOTS[newSlot.timeSlot],
      },
    })
  } catch (error) {
    console.error('Reassign slot error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * GET - Show current slot assignment for a client
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: clientId } = await params

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        businessName: true,
        scheduleDayPair: true,
        scheduleTimeSlot: true,
        autoScheduleEnabled: true,
        subscriptionStatus: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days = client.scheduleDayPair
      ? DAY_PAIRS[client.scheduleDayPair as keyof typeof DAY_PAIRS]
      : null

    return NextResponse.json({
      client: client.businessName,
      autoScheduleEnabled: client.autoScheduleEnabled,
      subscriptionStatus: client.subscriptionStatus,
      schedule: client.scheduleDayPair ? {
        dayPair: client.scheduleDayPair,
        days: days ? `${dayNames[days.day1]} & ${dayNames[days.day2]}` : null,
        timeSlot: client.scheduleTimeSlot,
        time: client.scheduleTimeSlot !== null ? TIME_SLOTS[client.scheduleTimeSlot] : null,
      } : null,
    })
  } catch (error) {
    console.error('Get slot error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
