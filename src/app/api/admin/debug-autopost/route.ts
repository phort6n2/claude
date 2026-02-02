import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DAY_PAIRS, DayPairKey } from '@/lib/automation/auto-scheduler'

const MOUNTAIN_TIMEZONE = 'America/Denver'
const MOUNTAIN_TIME_HOURS = [7, 8, 9, 10, 11, 13, 14, 15, 16, 17] as const

function getCurrentMountainTime() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOUNTAIN_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  return formatter.format(now)
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

function getCurrentMountainHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOUNTAIN_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  })
  const hourStr = formatter.format(new Date())
  return parseInt(hourStr, 10)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientName = searchParams.get('client') || 'collision'

  try {
    // Find the client
    const client = await prisma.client.findFirst({
      where: {
        businessName: { contains: clientName, mode: 'insensitive' },
      },
      include: {
        serviceLocations: { where: { isActive: true } },
        clientPAAs: { where: { isActive: true }, take: 5 },
      },
    })

    if (!client) {
      return NextResponse.json({ error: `Client not found matching: ${clientName}` }, { status: 404 })
    }

    // Get today's content for this client
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const todayContent = await prisma.contentItem.findMany({
      where: {
        clientId: client.id,
        scheduledDate: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        status: true,
        paaQuestion: true,
        scheduledDate: true,
        createdAt: true,
        pipelineStep: true,
        lastError: true,
      },
    })

    // Get recent publishing logs
    const recentLogs = await prisma.publishingLog.findMany({
      where: {
        clientId: client.id,
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
    })

    // Calculate scheduling info
    const currentMtHour = getCurrentMountainHour()
    const currentMtDay = getCurrentMountainDay()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    const slotIndex = client.scheduleTimeSlot as number | null
    const dayPair = client.scheduleDayPair as DayPairKey | null

    let scheduledHour: number | null = null
    let scheduledDays: string | null = null
    let wouldPublishNow = false

    if (slotIndex !== null && dayPair !== null) {
      scheduledHour = MOUNTAIN_TIME_HOURS[slotIndex]
      const { day1, day2 } = DAY_PAIRS[dayPair]
      scheduledDays = `${dayNames[day1]}/${dayNames[day2]}`

      const hourMatches = currentMtHour === scheduledHour
      const dayMatches = currentMtDay === day1 || currentMtDay === day2
      wouldPublishNow = hourMatches && dayMatches
    }

    return NextResponse.json({
      client: {
        id: client.id,
        businessName: client.businessName,
        status: client.status,
        subscriptionStatus: client.subscriptionStatus,
        autoScheduleEnabled: client.autoScheduleEnabled,
        scheduleTimeSlot: client.scheduleTimeSlot,
        scheduleDayPair: client.scheduleDayPair,
        wordpressConnected: client.wordpressConnected,
        serviceLocationsCount: client.serviceLocations.length,
        activePAAsCount: client.clientPAAs.length,
      },
      scheduling: {
        currentMountainTime: getCurrentMountainTime(),
        currentMtHour,
        currentMtDay: dayNames[currentMtDay],
        scheduledHour: scheduledHour !== null ? `${scheduledHour}:00 MT` : 'NOT SET',
        scheduledDays: scheduledDays || 'NOT SET',
        wouldPublishNow,
        cronSchedule: '0 * * * 1-5 (hourly Mon-Fri)',
      },
      todayContent: todayContent.length > 0 ? todayContent : 'No content for today',
      recentLogs: recentLogs.length > 0 ? recentLogs.map(l => ({
        action: l.action,
        status: l.status,
        startedAt: l.startedAt,
        errorMessage: l.errorMessage,
      })) : 'No recent logs',
      diagnosis: getDiagnosis(client, todayContent, slotIndex, dayPair, currentMtDay, currentMtHour),
    })
  } catch (error) {
    console.error('Debug autopost error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function getDiagnosis(
  client: { autoScheduleEnabled: boolean; status: string; subscriptionStatus: string; serviceLocations: unknown[]; clientPAAs: unknown[] },
  todayContent: unknown[],
  slotIndex: number | null,
  dayPair: DayPairKey | null,
  currentMtDay: number,
  currentMtHour: number
): string[] {
  const issues: string[] = []
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (!client.autoScheduleEnabled) {
    issues.push('❌ autoScheduleEnabled is FALSE - client will not auto-publish')
  }

  if (client.status !== 'ACTIVE') {
    issues.push(`❌ Client status is ${client.status} - must be ACTIVE`)
  }

  if (!['TRIAL', 'ACTIVE'].includes(client.subscriptionStatus)) {
    issues.push(`❌ Subscription status is ${client.subscriptionStatus} - must be TRIAL or ACTIVE`)
  }

  if (slotIndex === null) {
    issues.push('❌ scheduleTimeSlot is not set')
  }

  if (dayPair === null) {
    issues.push('❌ scheduleDayPair is not set')
  }

  if (client.serviceLocations.length === 0) {
    issues.push('❌ No active service locations')
  }

  if (client.clientPAAs.length === 0) {
    issues.push('❌ No active PAA questions')
  }

  if (todayContent.length > 0) {
    issues.push(`⚠️ Content already exists for today (${todayContent.length} items) - cron skips if content exists`)
  }

  if (slotIndex !== null && dayPair !== null) {
    const scheduledHour = MOUNTAIN_TIME_HOURS[slotIndex]
    const { day1, day2 } = DAY_PAIRS[dayPair]

    if (currentMtDay !== day1 && currentMtDay !== day2) {
      issues.push(`⚠️ Today (${dayNames[currentMtDay]}) is not a scheduled day (${dayNames[day1]}/${dayNames[day2]})`)
    }

    if (currentMtHour !== scheduledHour) {
      issues.push(`⏰ Current hour (${currentMtHour}:00) doesn't match scheduled hour (${scheduledHour}:00)`)
    }

    // Check if the scheduled hour already passed today
    if (currentMtHour > scheduledHour && (currentMtDay === day1 || currentMtDay === day2)) {
      issues.push(`⚠️ Scheduled time (${scheduledHour}:00 MT) already passed today - cron may have failed to run`)
    }
  }

  if (issues.length === 0) {
    issues.push('✅ Configuration looks correct - check Vercel cron logs for errors')
  }

  return issues
}
