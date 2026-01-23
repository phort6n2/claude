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
    // Use the selected date if provided, otherwise use current date in client's timezone
    let clientYear: number, clientMonth: number, clientDate: number, clientDay: number

    if (dateStr) {
      // Use the selected date as the reference point
      const [year, month, day] = dateStr.split('-').map(Number)
      const selectedDate = new Date(year, month - 1, day)
      clientYear = year
      clientMonth = month - 1
      clientDate = day
      clientDay = selectedDate.getDay()
    } else {
      // Use current date in client's timezone
      const nowInTz = new Date().toLocaleString('en-US', { timeZone: session.timezone })
      const clientNow = new Date(nowInTz)
      clientYear = clientNow.getFullYear()
      clientMonth = clientNow.getMonth()
      clientDate = clientNow.getDate()
      clientDay = clientNow.getDay()
    }

    // Get timezone offset for proper date comparisons
    // saleDate stores full timestamps (e.g., 2025-01-22T22:45:00.000Z for 3:45 PM MST)
    // so we need to use timezone-adjusted bounds
    const tzOffset = new Date().toLocaleString('en-US', { timeZone: session.timezone, timeZoneName: 'shortOffset' })
    const offsetMatch = tzOffset.match(/GMT([+-]\d+)/)
    const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0

    // Start/end of selected day in client's timezone converted to UTC
    const startOfToday = new Date(Date.UTC(clientYear, clientMonth, clientDate, -offsetHours, 0, 0))
    const endOfToday = new Date(Date.UTC(clientYear, clientMonth, clientDate, -offsetHours + 23, 59, 59, 999))
    // Start/end of week (Sunday to Saturday) in client's timezone
    const startOfWeek = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay, -offsetHours, 0, 0))
    const endOfWeek = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay + 6, -offsetHours + 23, 59, 59, 999))
    // Start/end of month in client's timezone
    const startOfMonth = new Date(Date.UTC(clientYear, clientMonth, 1, -offsetHours, 0, 0))
    const lastDayOfMonth = new Date(clientYear, clientMonth + 1, 0).getDate()
    const endOfMonth = new Date(Date.UTC(clientYear, clientMonth, lastDayOfMonth, -offsetHours + 23, 59, 59, 999))

    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfWeek, lte: endOfWeek },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId: session.clientId,
          status: 'SOLD',
          saleDate: { gte: startOfMonth, lte: endOfMonth },
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
