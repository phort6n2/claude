import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/health-check
 *
 * Returns the current health status of the content automation system.
 * Requires admin authentication.
 */
export async function GET() {
  // Check auth
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Run all queries in parallel for speed
    const [
      statusCounts,
      stuckGenerating,
      stuckScheduled,
      recentCrons,
      autoClients,
      recentContent,
      recentPublished,
      recentReview,
      recentFailed,
    ] = await Promise.all([
      // 1. Content by status
      prisma.contentItem.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // 2. Stuck GENERATING (>2hrs)
      prisma.contentItem.findMany({
        where: {
          status: 'GENERATING',
          updatedAt: { lt: twoHoursAgo },
        },
        select: {
          id: true,
          paaQuestion: true,
          updatedAt: true,
          retryCount: true,
          lastError: true,
          client: { select: { businessName: true } },
        },
      }),

      // 3. Stuck SCHEDULED (>6hrs)
      prisma.contentItem.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledDate: { lt: sixHoursAgo },
        },
        select: {
          id: true,
          scheduledDate: true,
          client: { select: { businessName: true } },
        },
      }),

      // 4. Recent cron runs
      prisma.publishingLog.findMany({
        where: { action: 'cron_hourly_publish' },
        orderBy: { startedAt: 'desc' },
        take: 10,
        select: {
          status: true,
          startedAt: true,
          durationMs: true,
          responseData: true,
        },
      }),

      // 5. Auto-schedule enabled clients
      prisma.client.findMany({
        where: {
          status: 'ACTIVE',
          autoScheduleEnabled: true,
        },
        select: {
          businessName: true,
          scheduleDayPair: true,
          scheduleTimeSlot: true,
        },
      }),

      // 6-8. Recent content stats
      prisma.contentItem.count({
        where: { createdAt: { gte: weekAgo } },
      }),
      prisma.contentItem.count({
        where: { createdAt: { gte: weekAgo }, status: 'PUBLISHED' },
      }),
      prisma.contentItem.count({
        where: { createdAt: { gte: weekAgo }, status: 'REVIEW' },
      }),

      // 9. Recent failures
      prisma.contentItem.findMany({
        where: {
          createdAt: { gte: weekAgo },
          status: 'FAILED',
        },
        select: {
          id: true,
          lastError: true,
          createdAt: true,
          client: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    // Parse cron data
    const cronRuns = recentCrons.map(c => {
      let processed = 0
      let successful = 0
      let failed = 0
      try {
        const data = c.responseData ? JSON.parse(c.responseData as string) : {}
        processed = data.processed || 0
        successful = data.successful || 0
        failed = data.failed || 0
      } catch (e) {}
      return {
        status: c.status,
        startedAt: c.startedAt,
        durationMs: c.durationMs,
        processed,
        successful,
        failed,
      }
    })

    // Get current Mountain Time
    const mtFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    // Build status summary
    const statusMap: Record<string, number> = {}
    statusCounts.forEach(s => {
      statusMap[s.status] = s._count.status
    })

    // Determine overall health
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
    const issues: string[] = []

    if (stuckGenerating.length > 0) {
      healthStatus = 'warning'
      issues.push(`${stuckGenerating.length} content items stuck in GENERATING`)
    }
    if (stuckScheduled.length > 0) {
      healthStatus = 'warning'
      issues.push(`${stuckScheduled.length} content items stuck in SCHEDULED`)
    }
    if (cronRuns.length === 0) {
      healthStatus = 'warning'
      issues.push('No cron runs logged yet')
    } else if (cronRuns[0].status === 'FAILED') {
      healthStatus = 'critical'
      issues.push('Most recent cron run failed')
    }
    if (recentFailed.length > 5) {
      healthStatus = 'warning'
      issues.push(`${recentFailed.length} failures in the last 7 days`)
    }

    return NextResponse.json({
      health: healthStatus,
      issues: issues.length > 0 ? issues : ['All systems operational'],
      timestamp: now.toISOString(),
      mountainTime: mtFormatter.format(now),

      contentByStatus: statusMap,

      stuckContent: {
        generating: stuckGenerating.map(c => ({
          id: c.id,
          client: c.client.businessName,
          question: c.paaQuestion?.substring(0, 60),
          updatedAt: c.updatedAt,
          retryCount: c.retryCount,
          lastError: c.lastError?.substring(0, 100),
        })),
        scheduled: stuckScheduled.map(c => ({
          id: c.id,
          client: c.client.businessName,
          scheduledDate: c.scheduledDate,
        })),
      },

      cronRuns,

      autoScheduleClients: autoClients.map(c => ({
        name: c.businessName,
        dayPair: c.scheduleDayPair,
        timeSlot: c.scheduleTimeSlot,
      })),

      last7Days: {
        created: recentContent,
        published: recentPublished,
        inReview: recentReview,
        failed: recentFailed.length,
      },

      recentFailures: recentFailed.map(c => ({
        id: c.id,
        client: c.client.businessName,
        error: c.lastError?.substring(0, 100),
        createdAt: c.createdAt,
      })),
    })
  } catch (error) {
    console.error('[HealthCheck] Error:', error)
    return NextResponse.json(
      { error: 'Health check failed', details: String(error) },
      { status: 500 }
    )
  }
}
