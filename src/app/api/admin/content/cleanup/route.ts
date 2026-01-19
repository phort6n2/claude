import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/content/cleanup
 *
 * Find content items that might be blocking new content creation.
 * Shows content from today and recent FAILED items.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setUTCHours(23, 59, 59, 999)

  // Find today's content items
  const todayContent = await prisma.contentItem.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      scheduledDate: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
    include: {
      client: {
        select: {
          businessName: true,
        },
      },
      clientPAA: {
        select: {
          question: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Find recent FAILED items (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const failedContent = await prisma.contentItem.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      status: 'FAILED',
      createdAt: { gte: weekAgo },
    },
    include: {
      client: {
        select: {
          businessName: true,
        },
      },
      clientPAA: {
        select: {
          question: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Find GENERATING items (might be stuck)
  const generatingContent = await prisma.contentItem.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      status: 'GENERATING',
    },
    include: {
      client: {
        select: {
          businessName: true,
        },
      },
      clientPAA: {
        select: {
          question: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    today: {
      count: todayContent.length,
      items: todayContent.map(item => ({
        id: item.id,
        clientName: item.client.businessName,
        paaQuestion: item.clientPAA?.question || item.paaQuestion,
        status: item.status,
        scheduledDate: item.scheduledDate,
        createdAt: item.createdAt,
      })),
    },
    failed: {
      count: failedContent.length,
      items: failedContent.map(item => ({
        id: item.id,
        clientName: item.client.businessName,
        paaQuestion: item.clientPAA?.question || item.paaQuestion,
        status: item.status,
        scheduledDate: item.scheduledDate,
        createdAt: item.createdAt,
      })),
    },
    generating: {
      count: generatingContent.length,
      items: generatingContent.map(item => ({
        id: item.id,
        clientName: item.client.businessName,
        paaQuestion: item.clientPAA?.question || item.paaQuestion,
        status: item.status,
        scheduledDate: item.scheduledDate,
        createdAt: item.createdAt,
        stuckFor: Math.round((Date.now() - item.createdAt.getTime()) / 60000) + ' minutes',
      })),
    },
  })
}

/**
 * DELETE /api/admin/content/cleanup
 *
 * Delete specific content items by ID.
 * Body: { ids: string[] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids } = body as { ids: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids array is required' },
        { status: 400 }
      )
    }

    // Delete the content items
    const result = await prisma.contentItem.deleteMany({
      where: {
        id: { in: ids },
      },
    })

    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    console.error('Cleanup delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete content items' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/content/cleanup
 *
 * Bulk actions for content cleanup.
 * Body: { action: 'delete_failed' | 'delete_today' | 'reset_generating', clientId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, clientId } = body as { action: string; clientId?: string }

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setUTCHours(23, 59, 59, 999)

    let result

    switch (action) {
      case 'delete_failed':
        // Delete all FAILED content items
        result = await prisma.contentItem.deleteMany({
          where: {
            ...(clientId ? { clientId } : {}),
            status: 'FAILED',
          },
        })
        return NextResponse.json({
          success: true,
          action: 'delete_failed',
          deleted: result.count,
        })

      case 'delete_today':
        // Delete all content items from today (use with caution!)
        result = await prisma.contentItem.deleteMany({
          where: {
            ...(clientId ? { clientId } : {}),
            scheduledDate: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        })
        return NextResponse.json({
          success: true,
          action: 'delete_today',
          deleted: result.count,
        })

      case 'reset_generating':
        // Reset GENERATING items back to SCHEDULED (for stuck items)
        result = await prisma.contentItem.updateMany({
          where: {
            ...(clientId ? { clientId } : {}),
            status: 'GENERATING',
          },
          data: {
            status: 'FAILED',
            pipelineStep: 'stuck_reset',
          },
        })
        return NextResponse.json({
          success: true,
          action: 'reset_generating',
          updated: result.count,
        })

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Cleanup action error:', error)
    return NextResponse.json(
      { error: 'Failed to perform cleanup action' },
      { status: 500 }
    )
  }
}
