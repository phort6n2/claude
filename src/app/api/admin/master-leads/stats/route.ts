import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Get the start of a day in a specific timezone, returned as UTC Date
 */
function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  // Get the date parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0')
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1')

  // Calculate the offset by comparing UTC and local representations
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = utcDate.getTime() - tzDate.getTime()

  // Create midnight in that timezone and convert to UTC
  const midnightLocal = new Date(year, month, day, 0, 0, 0, 0)
  return new Date(midnightLocal.getTime() + offsetMs)
}

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
    const now = new Date()

    // Get current date parts in client's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    })
    const dayOfWeek = formatter.format(now)
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const clientDay = dayMap[dayOfWeek] ?? 0

    // Calculate start dates in UTC
    const startOfToday = getStartOfDayInTimezone(now, timezone)

    // Start of week (Sunday)
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - clientDay)
    const startOfWeek = getStartOfDayInTimezone(weekStart, timezone)

    // Start of month
    const monthFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    })
    const monthParts = monthFormatter.formatToParts(now)
    const year = parseInt(monthParts.find(p => p.type === 'year')?.value || '0')
    const month = parseInt(monthParts.find(p => p.type === 'month')?.value || '1') - 1
    const startOfMonth = getStartOfDayInTimezone(new Date(year, month, 1), timezone)

    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfToday },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfWeek },
        },
        _sum: { saleValue: true },
        _count: true,
      }),
      prisma.lead.aggregate({
        where: {
          clientId,
          status: 'SOLD',
          saleDate: { gte: startOfMonth },
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
