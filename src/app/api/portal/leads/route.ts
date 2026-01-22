import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/leads - Fetch leads for the logged-in client
 */
export async function GET(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const dateStr = searchParams.get('date') // Format: YYYY-MM-DD
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    // Helper function to get start/end of day in client's timezone
    function getDateRangeInTimezone(dateStr: string, timezone: string) {
      // Parse the input date parts
      const [year, month, day] = dateStr.split('-').map(Number)

      // Get timezone offset from the timezone name
      const tzOffset = new Date().toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      const offsetMatch = tzOffset.match(/GMT([+-]\d+)/)
      const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0

      // Start of day in client's timezone converted to UTC
      // For America/Los_Angeles (UTC-8), midnight local = 8:00 UTC
      const startOfDay = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0))
      const endOfDay = new Date(Date.UTC(year, month - 1, day, -offsetHours + 23, 59, 59, 999))

      return { startOfDay, endOfDay }
    }

    // Build where clause - always filter by client
    const where: Record<string, unknown> = {
      clientId: session.clientId,
    }

    if (status) {
      where.status = status
    }

    // Date filter - filter by the date the lead was created in client's timezone
    if (dateStr) {
      const { startOfDay, endOfDay } = getDateRangeInTimezone(dateStr, session.timezone)
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    // Fetch leads for this client only
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          status: true,
          source: true,
          formName: true,
          formData: true,
          saleValue: true,
          saleDate: true,
          saleNotes: true,
          createdAt: true,
          statusUpdatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.lead.count({ where }),
    ])

    // Get summary stats for this client
    const stats = await prisma.lead.groupBy({
      by: ['status'],
      where: { clientId: session.clientId },
      _count: true,
    })

    const statusCounts = stats.reduce((acc, s) => {
      acc[s.status] = s._count
      return acc
    }, {} as Record<string, number>)

    // Calculate sales stats (today, this week, this month) in client's timezone
    // Get current date in client's timezone
    const nowInTz = new Date().toLocaleString('en-US', { timeZone: session.timezone })
    const clientNow = new Date(nowInTz)
    const clientYear = clientNow.getFullYear()
    const clientMonth = clientNow.getMonth()
    const clientDate = clientNow.getDate()
    const clientDay = clientNow.getDay()

    // For saleDate comparisons, we need to use midnight UTC because saleDate is stored
    // as a date string (e.g., "2025-01-22") which becomes "2025-01-22T00:00:00.000Z" in DB.
    // We compare against the date portion only, not timezone-adjusted times.
    const startOfTodayUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate, 0, 0, 0))
    const startOfWeekUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay, 0, 0, 0))
    const startOfMonthUTC = new Date(Date.UTC(clientYear, clientMonth, 1, 0, 0, 0))

    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfTodayUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfWeekUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfMonthUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
    ])

    return NextResponse.json({
      leads,
      total,
      limit,
      offset,
      stats: {
        total,
        byStatus: statusCounts,
      },
      sales: {
        today: { count: salesToday._count, total: salesToday._sum.saleValue || 0 },
        week: { count: salesWeek._count, total: salesWeek._sum.saleValue || 0 },
        month: { count: salesMonth._count, total: salesMonth._sum.saleValue || 0 },
      },
    })
  } catch (error) {
    console.error('Failed to fetch portal leads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}
