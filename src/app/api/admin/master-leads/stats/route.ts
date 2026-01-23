import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/master-leads/stats - Get sales stats for a specific client (admin only)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const dateStr = searchParams.get('date') // Format: YYYY-MM-DD

  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  try {
    // Get client's timezone (default to America/Denver - Mountain Time)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { timezone: true },
    })

    const timezone = client?.timezone || 'America/Denver'

    // Calculate reference date - use provided date or current date in client's timezone
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
      const nowInTz = new Date().toLocaleString('en-US', { timeZone: timezone })
      const clientNow = new Date(nowInTz)
      clientYear = clientNow.getFullYear()
      clientMonth = clientNow.getMonth()
      clientDate = clientNow.getDate()
      clientDay = clientNow.getDay()
    }

    // For saleDate comparisons, we use midnight UTC because saleDate is stored
    // as a date string (e.g., "2025-01-22") which becomes "2025-01-22T00:00:00.000Z" in DB.
    const startOfTodayUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate, 0, 0, 0))
    const endOfTodayUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate, 23, 59, 59, 999))
    const startOfWeekUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay, 0, 0, 0))
    const endOfWeekUTC = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay + 6, 23, 59, 59, 999))
    const startOfMonthUTC = new Date(Date.UTC(clientYear, clientMonth, 1, 0, 0, 0))
    const endOfMonthUTC = new Date(Date.UTC(clientYear, clientMonth + 1, 0, 23, 59, 59, 999))

    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfTodayUTC, lte: endOfTodayUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfWeekUTC, lte: endOfWeekUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfMonthUTC, lte: endOfMonthUTC },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
    ])

    return NextResponse.json({
      sales: {
        today: { count: salesToday._count, total: salesToday._sum.saleValue || 0 },
        week: { count: salesWeek._count, total: salesWeek._sum.saleValue || 0 },
        month: { count: salesMonth._count, total: salesMonth._sum.saleValue || 0 },
      },
    })
  } catch (error) {
    console.error('Failed to fetch master leads stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
