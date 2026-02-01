import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DAY_PAIRS, DayPairKey } from '@/lib/automation/auto-scheduler'

const MOUNTAIN_TIMEZONE = 'America/Denver'
const MOUNTAIN_TIME_HOURS = [7, 8, 9, 10, 11, 13, 14, 15, 16, 17] as const

function getCurrentMountainHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOUNTAIN_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  })
  return parseInt(formatter.format(new Date()), 10)
}

function getCurrentMountainDay(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOUNTAIN_TIMEZONE,
    weekday: 'short',
  })
  const dayStr = formatter.format(new Date())
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dayMap[dayStr] ?? new Date().getUTCDay()
}

/**
 * Debug endpoint - shows what the hourly-publish cron would do
 * No auth required - read-only diagnostic
 */
export async function GET(request: NextRequest) {
  const now = new Date()
  const currentMtHour = getCurrentMountainHour()
  const currentMtDay = getCurrentMountainDay()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Get ALL clients with auto-schedule enabled
  const allClients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
    },
    select: {
      id: true,
      businessName: true,
      status: true,
      subscriptionStatus: true,
      autoScheduleEnabled: true,
      scheduleDayPair: true,
      scheduleTimeSlot: true,
      lastAutoScheduledAt: true,
      _count: {
        select: {
          serviceLocations: { where: { isActive: true } },
          clientPAAs: { where: { isActive: true } },
        },
      },
    },
    orderBy: { businessName: 'asc' },
  })

  // Categorize clients
  const clientAnalysis = allClients.map(client => {
    const issues: string[] = []
    let wouldRunNow = false
    let nextRunTime = 'N/A'
    const clientId = client.id

    // Check subscription
    if (!['TRIAL', 'ACTIVE'].includes(client.subscriptionStatus || '')) {
      issues.push(`subscriptionStatus is "${client.subscriptionStatus}" (needs TRIAL or ACTIVE)`)
    }

    // Check schedule configuration
    if (client.scheduleDayPair === null) {
      issues.push('scheduleDayPair is NOT SET')
    }
    if (client.scheduleTimeSlot === null) {
      issues.push('scheduleTimeSlot is NOT SET')
    }

    // Check PAAs and locations
    if (client._count.clientPAAs === 0) {
      issues.push('No active PAA questions')
    }
    if (client._count.serviceLocations === 0) {
      issues.push('No active service locations')
    }

    // Check if would run now
    if (client.scheduleDayPair && client.scheduleTimeSlot !== null) {
      const dayPair = client.scheduleDayPair as DayPairKey
      const slotIndex = client.scheduleTimeSlot as number
      const preferredHour = MOUNTAIN_TIME_HOURS[slotIndex]
      const { day1, day2 } = DAY_PAIRS[dayPair]

      const hourMatches = currentMtHour === preferredHour
      const dayMatches = currentMtDay === day1 || currentMtDay === day2

      wouldRunNow = hourMatches && dayMatches && issues.length === 0

      // Calculate next run time
      const scheduledDays = [dayNames[day1], dayNames[day2]]
      nextRunTime = `${scheduledDays.join(' & ')} at ${preferredHour}:00 MT`

      if (!dayMatches) {
        issues.push(`Today is ${dayNames[currentMtDay]}, scheduled for ${scheduledDays.join('/')}`)
      }
      if (!hourMatches && dayMatches) {
        issues.push(`Current hour is ${currentMtHour}:00 MT, scheduled for ${preferredHour}:00 MT`)
      }
    }

    return {
      id: clientId,
      name: client.businessName,
      subscriptionStatus: client.subscriptionStatus,
      scheduleDayPair: client.scheduleDayPair,
      scheduleTimeSlot: client.scheduleTimeSlot,
      slotHour: client.scheduleTimeSlot !== null ? `${MOUNTAIN_TIME_HOURS[client.scheduleTimeSlot as number]}:00 MT` : null,
      activeLocations: client._count.serviceLocations,
      activePAAs: client._count.clientPAAs,
      lastAutoScheduledAt: client.lastAutoScheduledAt,
      wouldRunNow,
      nextRunTime,
      issues: issues.length > 0 ? issues : ['Ready to run'],
    }
  })

  // Get today's content
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayContent = await prisma.contentItem.findMany({
    where: {
      createdAt: { gte: todayStart },
    },
    include: {
      client: { select: { businessName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const readyToRun = clientAnalysis.filter(c => c.wouldRunNow)
  const notReady = clientAnalysis.filter(c => !c.wouldRunNow)

  return NextResponse.json({
    currentTime: {
      utc: now.toISOString(),
      mountainTime: `${dayNames[currentMtDay]} ${currentMtHour}:00 MT`,
      day: dayNames[currentMtDay],
      hour: currentMtHour,
    },
    summary: {
      totalAutoScheduleClients: allClients.length,
      wouldRunNow: readyToRun.length,
      notReadyOrWrongTime: notReady.length,
      contentCreatedToday: todayContent.length,
    },
    clientsWouldRunNow: readyToRun,
    clientsNotRunning: notReady,
    todayContent: todayContent.map(c => ({
      client: c.client.businessName,
      status: c.status,
      paaQuestion: c.paaQuestion?.substring(0, 50) + '...',
      createdAt: c.createdAt,
    })),
  })
}
