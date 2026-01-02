import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/clients/[id]/clear-schedule - Clear all scheduled content
 * Deletes all DRAFT and SCHEDULED content items for a client
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get client to verify it exists
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Delete all DRAFT and SCHEDULED content items
    // (Don't delete PUBLISHED, IN_PROGRESS, or FAILED items)
    const result = await prisma.contentItem.deleteMany({
      where: {
        clientId: id,
        status: {
          in: ['DRAFT', 'SCHEDULED'],
        },
      },
    })

    // Reset calendar status
    await prisma.client.update({
      where: { id },
      data: {
        calendarGenerated: false,
        calendarGeneratedAt: null,
        calendarEndDate: null,
      },
    })

    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    console.error('Clear schedule error:', error)
    return NextResponse.json(
      { error: 'Failed to clear schedule' },
      { status: 500 }
    )
  }
}
