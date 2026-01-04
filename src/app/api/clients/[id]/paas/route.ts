import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const paas = await prisma.clientPAA.findMany({
      where: {
        clientId: id,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        question: true,
        priority: true,
        usedAt: true,
        usedCount: true,
      },
    })

    return NextResponse.json({ paas })
  } catch (error) {
    console.error('Failed to fetch PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PAAs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/clients/[id]/paas
 * Add or replace PAA questions for a client
 *
 * Body: { paaText: string, append?: boolean }
 * - paaText: newline-separated PAA questions
 * - append: if true, add new PAAs to end; if false (default), replace all
 *
 * Priority logic:
 * - Questions are assigned priority based on their order (1, 2, 3...)
 * - If appending, new questions start after current max priority
 * - New PAAs added to the bottom of the list
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const body = await request.json()
    const { paaText, append = false } = body

    if (!paaText || typeof paaText !== 'string') {
      return NextResponse.json(
        { error: 'paaText is required' },
        { status: 400 }
      )
    }

    // Parse and validate questions
    const lines = paaText
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)

    const validQuestions: string[] = []
    for (const line of lines) {
      const hasLocation = /\{location\}/i.test(line)
      const hasQuestionMark = line.endsWith('?')
      if (hasLocation && hasQuestionMark) {
        validQuestions.push(line)
      }
    }

    if (validQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No valid PAA questions found. Questions must include {location} and end with ?' },
        { status: 400 }
      )
    }

    let startPriority = 1

    if (append) {
      // Get current max priority to append after
      const maxPriority = await prisma.clientPAA.aggregate({
        where: { clientId: id, isActive: true },
        _max: { priority: true },
      })
      startPriority = (maxPriority._max.priority || 0) + 1

      // Filter out questions that already exist
      const existingQuestions = await prisma.clientPAA.findMany({
        where: { clientId: id, isActive: true },
        select: { question: true },
      })
      const existingSet = new Set(existingQuestions.map(p => p.question.toLowerCase()))
      const newQuestions = validQuestions.filter(q => !existingSet.has(q.toLowerCase()))

      if (newQuestions.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'All questions already exist',
          added: 0,
          total: existingQuestions.length,
        })
      }

      // Create only new PAAs
      await prisma.clientPAA.createMany({
        data: newQuestions.map((question, index) => ({
          clientId: id,
          question,
          priority: startPriority + index,
          isActive: true,
        })),
      })

      const total = existingQuestions.length + newQuestions.length
      return NextResponse.json({
        success: true,
        added: newQuestions.length,
        total,
        message: `Added ${newQuestions.length} new PAAs (${total} total)`,
      })
    } else {
      // Replace mode: deactivate old PAAs and create new ones
      await prisma.$transaction(async (tx) => {
        // Soft delete existing PAAs (keep for history)
        await tx.clientPAA.updateMany({
          where: { clientId: id, isActive: true },
          data: { isActive: false },
        })

        // Create new PAAs
        await tx.clientPAA.createMany({
          data: validQuestions.map((question, index) => ({
            clientId: id,
            question,
            priority: index + 1,
            isActive: true,
          })),
        })
      })

      return NextResponse.json({
        success: true,
        total: validQuestions.length,
        message: `Saved ${validQuestions.length} PAA questions`,
      })
    }
  } catch (error) {
    console.error('Failed to save PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to save PAAs' },
      { status: 500 }
    )
  }
}
