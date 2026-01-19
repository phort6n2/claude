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

    // Get current date in client's timezone
    const nowInTz = new Date().toLocaleString('en-US', { timeZone: timezone })
    const clientNow = new Date(nowInTz)
    const clientYear = clientNow.getFullYear()
    const clientMonth = clientNow.getMonth()
    const clientDate = clientNow.getDate()
    const clientDay = clientNow.getDay()

    // Get timezone offset
    const tzOffset = new Date().toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
    const offsetMatch = tzOffset.match(/GMT([+-]\d+)/)
    const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0

    // Start of today in client's timezone (converted to UTC)
    const startOfToday = new Date(Date.UTC(clientYear, clientMonth, clientDate, -offsetHours, 0, 0))

    // Start of week (Sunday) in client's timezone
    const startOfWeek = new Date(Date.UTC(clientYear, clientMonth, clientDate - clientDay, -offsetHours, 0, 0))

    // Start of month in client's timezone
    const startOfMonth = new Date(Date.UTC(clientYear, clientMonth, 1, -offsetHours, 0, 0))

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
