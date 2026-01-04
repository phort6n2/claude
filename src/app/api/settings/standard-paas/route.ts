import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/settings/standard-paas
 * Fetch all standard PAA questions
 */
export async function GET() {
  try {
    const paas = await prisma.standardPAA.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        question: true,
        priority: true,
        category: true,
      },
    })

    return NextResponse.json({ paas, total: paas.length })
  } catch (error) {
    console.error('Failed to fetch standard PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch standard PAAs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/standard-paas
 * Save standard PAA questions (replace all)
 *
 * Body: { paaText: string } - newline-separated PAA questions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paaText } = body

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

    // Replace all standard PAAs in a transaction
    await prisma.$transaction(async (tx) => {
      // Soft delete existing standard PAAs
      await tx.standardPAA.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Create new standard PAAs
      await tx.standardPAA.createMany({
        data: validQuestions.map((question, index) => ({
          question,
          priority: index + 1,
          isActive: true,
        })),
      })
    })

    return NextResponse.json({
      success: true,
      total: validQuestions.length,
      message: `Saved ${validQuestions.length} standard PAA questions`,
    })
  } catch (error) {
    console.error('Failed to save standard PAAs:', error)
    return NextResponse.json(
      { error: 'Failed to save standard PAAs' },
      { status: 500 }
    )
  }
}
