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
    // Build where clause - always filter by client
    const where: Record<string, unknown> = {
      clientId: session.clientId,
    }

    if (status) {
      where.status = status
    }

    // Date filter - filter by the date the lead was created
    if (dateStr) {
      const startOfDay = new Date(dateStr + 'T00:00:00.000Z')
      const endOfDay = new Date(dateStr + 'T23:59:59.999Z')
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

    return NextResponse.json({
      leads,
      total,
      limit,
      offset,
      stats: {
        total,
        byStatus: statusCounts,
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
