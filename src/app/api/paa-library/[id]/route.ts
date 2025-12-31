import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/paa-library/[id] - Get a single PAA question
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const question = await prisma.pAAQuestion.findUnique({
    where: { id },
    include: {
      _count: {
        select: { contentItems: true },
      },
    },
  })

  if (!question) {
    return NextResponse.json({ error: 'PAA question not found' }, { status: 404 })
  }

  return NextResponse.json(question)
}

/**
 * PUT /api/paa-library/[id] - Update a PAA question
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { question, service, priority, category, isActive } = body

    // Check if question exists
    const existing = await prisma.pAAQuestion.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'PAA question not found' }, { status: 404 })
    }

    // Check for duplicate if question or service changed
    if (question !== existing.question || service !== existing.service) {
      const duplicate = await prisma.pAAQuestion.findFirst({
        where: {
          question: question || existing.question,
          service: service || existing.service,
          id: { not: id },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'A question with this text and service already exists' },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.pAAQuestion.update({
      where: { id },
      data: {
        ...(question && { question }),
        ...(service && { service }),
        ...(priority !== undefined && { priority }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update PAA question:', error)
    return NextResponse.json(
      { error: 'Failed to update PAA question' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/paa-library/[id] - Delete a PAA question
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Check if question exists and has content items
    const existing = await prisma.pAAQuestion.findUnique({
      where: { id },
      include: {
        _count: {
          select: { contentItems: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'PAA question not found' }, { status: 404 })
    }

    if (existing._count.contentItems > 0) {
      // Instead of deleting, deactivate it
      await prisma.pAAQuestion.update({
        where: { id },
        data: { isActive: false },
      })

      return NextResponse.json({
        message: 'Question deactivated (has associated content items)',
        deactivated: true,
      })
    }

    await prisma.pAAQuestion.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Question deleted' })
  } catch (error) {
    console.error('Failed to delete PAA question:', error)
    return NextResponse.json(
      { error: 'Failed to delete PAA question' },
      { status: 500 }
    )
  }
}
