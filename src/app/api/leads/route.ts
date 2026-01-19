import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/leads - Fetch leads with filtering
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const status = searchParams.get('status')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    // Build where clause
    const where: Record<string, unknown> = {}

    if (clientId) {
      where.clientId = clientId
    }

    if (status) {
      where.status = status
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate)
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate)
      }
    }

    // Fetch leads with client info (with retry for connection issues)
    const [leads, total] = await withRetry(() =>
      Promise.all([
        prisma.lead.findMany({
          where,
          include: {
            client: {
              select: {
                id: true,
                businessName: true,
                slug: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.lead.count({ where }),
      ])
    )

    // Get summary stats
    const stats = await withRetry(() =>
      prisma.lead.groupBy({
        by: ['status'],
        where: clientId ? { clientId } : undefined,
        _count: true,
      })
    )

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
    console.error('Failed to fetch leads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}
