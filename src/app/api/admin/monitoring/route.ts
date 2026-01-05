import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/monitoring
 * Returns monitoring data for the admin dashboard
 */
export async function GET() {
  try {
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

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

    return NextResponse.json({
      overview: {
        contentCreatedToday,
        contentPublishedToday,
        activeClientsWithSchedule: activeClients.length,
        failedContentLast7Days: failedContent.length,
      },
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
      clientStatus: lastContentPerClient,
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
