import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Day pair mapping for calculating next publish days
const DAY_PAIR_TO_DAYS: Record<string, number[]> = {
  MON_WED: [1, 3],  // Monday = 1, Wednesday = 3
  TUE_THU: [2, 4],
  WED_FRI: [3, 5],
  MON_THU: [1, 4],
  TUE_FRI: [2, 5],
  MON_FRI: [1, 5],
}

function getNextPublishDate(dayPair: string, currentDay: number): { day: string, daysUntil: number } {
  const days = DAY_PAIR_TO_DAYS[dayPair] || [1, 3]
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Find next publish day
  for (let i = 0; i <= 7; i++) {
    const checkDay = (currentDay + i) % 7
    if (days.includes(checkDay)) {
      return { day: dayNames[checkDay], daysUntil: i }
    }
  }
  return { day: dayNames[days[0]], daysUntil: days[0] - currentDay + 7 }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Monday start
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * GET /api/admin/monitoring
 * Returns monitoring data for the admin dashboard
 */
export async function GET() {
  try {
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // This week and last week calculations
    const thisWeekStart = getWeekStart(now)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)

    // Get recent cron runs (last 50)
    const recentCronRuns = await prisma.publishingLog.findMany({
      where: {
        action: { startsWith: 'cron_' },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    })

    // Get success/failure counts for last 24 hours
    const last24HourStats = await prisma.publishingLog.groupBy({
      by: ['status'],
      where: {
        action: { startsWith: 'cron_' },
        startedAt: { gte: last24Hours },
      },
      _count: true,
    })

    // Get success/failure counts for last 7 days
    const last7DayStats = await prisma.publishingLog.groupBy({
      by: ['status'],
      where: {
        action: { startsWith: 'cron_' },
        startedAt: { gte: last7Days },
      },
      _count: true,
    })

    // Get last publish time per active client
    const activeClients = await prisma.client.findMany({
      where: {
        status: 'ACTIVE',
        autoScheduleEnabled: true,
      },
      select: {
        id: true,
        businessName: true,
        scheduleDayPair: true,
        scheduleTimeSlot: true,
        lastAutoScheduledAt: true,
      },
      orderBy: { businessName: 'asc' },
    })

    // Get last successful content item per client
    const lastContentPerClient = await Promise.all(
      activeClients.map(async (client) => {
        const lastContent = await prisma.contentItem.findFirst({
          where: {
            clientId: client.id,
            status: { in: ['PUBLISHED', 'GENERATING', 'REVIEW'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            paaQuestion: true,
            scheduledDate: true,
            createdAt: true,
            publishedAt: true,
          },
        })
        return {
          ...client,
          lastContent,
        }
      })
    )

    // Get content items created today
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const contentCreatedToday = await prisma.contentItem.count({
      where: {
        createdAt: { gte: todayStart },
      },
    })

    // Get content items published today
    const contentPublishedToday = await prisma.contentItem.count({
      where: {
        publishedAt: { gte: todayStart },
      },
    })

    // Get failed content items (last 7 days)
    const failedContent = await prisma.contentItem.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: last7Days },
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // This week content stats
    const thisWeekCreated = await prisma.contentItem.count({
      where: { createdAt: { gte: thisWeekStart } },
    })
    const thisWeekPublished = await prisma.contentItem.count({
      where: { publishedAt: { gte: thisWeekStart } },
    })

    // Last week content stats
    const lastWeekCreated = await prisma.contentItem.count({
      where: {
        createdAt: { gte: lastWeekStart, lt: lastWeekEnd },
      },
    })
    const lastWeekPublished = await prisma.contentItem.count({
      where: {
        publishedAt: { gte: lastWeekStart, lt: lastWeekEnd },
      },
    })

    // Recent content (all statuses, last 20)
    const recentContent = await prisma.contentItem.findMany({
      where: {
        createdAt: { gte: last7Days },
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Get weekly activity breakdown (content published per day this week)
    const weeklyActivity = await prisma.contentItem.groupBy({
      by: ['publishedAt'],
      where: {
        publishedAt: { gte: thisWeekStart },
      },
      _count: true,
    })

    // Calculate next publish day for each client
    const currentDay = now.getDay()
    const clientsWithNextPublish = activeClients.map(client => {
      const nextPublish = client.scheduleDayPair
        ? getNextPublishDate(client.scheduleDayPair, currentDay)
        : null
      return {
        ...client,
        nextPublish,
      }
    })

    // Calculate stats
    const stats24h = {
      success: last24HourStats.find(s => s.status === 'SUCCESS')?._count || 0,
      failed: last24HourStats.find(s => s.status === 'FAILED')?._count || 0,
      total: last24HourStats.reduce((acc, s) => acc + s._count, 0),
    }

    const stats7d = {
      success: last7DayStats.find(s => s.status === 'SUCCESS')?._count || 0,
      failed: last7DayStats.find(s => s.status === 'FAILED')?._count || 0,
      total: last7DayStats.reduce((acc, s) => acc + s._count, 0),
    }

    // Build weekly activity by day
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const activityByDay: Record<string, number> = {}
    weekDays.forEach(day => { activityByDay[day] = 0 })

    weeklyActivity.forEach(item => {
      if (item.publishedAt) {
        const dayIndex = new Date(item.publishedAt).getDay()
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex]
        activityByDay[dayName] = (activityByDay[dayName] || 0) + item._count
      }
    })

    return NextResponse.json({
      overview: {
        contentCreatedToday,
        contentPublishedToday,
        activeClientsWithSchedule: activeClients.length,
        failedContentLast7Days: failedContent.length,
      },
      weeklyComparison: {
        thisWeek: { created: thisWeekCreated, published: thisWeekPublished },
        lastWeek: { created: lastWeekCreated, published: lastWeekPublished },
        weekStartDate: thisWeekStart,
      },
      activityByDay,
      stats: {
        last24Hours: stats24h,
        last7Days: stats7d,
      },
      recentCronRuns: recentCronRuns.map(run => ({
        id: run.id,
        action: run.action,
        status: run.status,
        clientName: run.client?.businessName || 'System',
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: run.durationMs,
        errorMessage: run.errorMessage,
        responseData: run.responseData ? JSON.parse(run.responseData) : null,
      })),
      clientStatus: clientsWithNextPublish.map(client => {
        const content = lastContentPerClient.find(c => c.id === client.id)?.lastContent
        return {
          ...client,
          lastContent: content || null,
        }
      }),
      recentContent: recentContent.map(item => ({
        id: item.id,
        clientName: item.client.businessName,
        clientId: item.client.id,
        paaQuestion: item.paaQuestion,
        status: item.status,
        createdAt: item.createdAt,
        publishedAt: item.publishedAt,
      })),
      failedContent: failedContent.map(item => ({
        id: item.id,
        clientName: item.client.businessName,
        clientId: item.client.id,
        paaQuestion: item.paaQuestion,
        createdAt: item.createdAt,
        status: item.status,
      })),
    })
  } catch (error) {
    console.error('Monitoring API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch monitoring data' },
      { status: 500 }
    )
  }
}
