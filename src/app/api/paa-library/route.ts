import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/paa-library - List PAA questions with filtering and pagination
 * Query params:
 *   - service: Filter by service type
 *   - category: Filter by category
 *   - search: Search in question text
 *   - priority: Filter by priority (high = 1-10, regular = 11+)
 *   - isActive: Filter by active status
 *   - page: Page number (default 1)
 *   - limit: Items per page (default 50)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const service = searchParams.get('service')
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const priority = searchParams.get('priority')
  const isActive = searchParams.get('isActive')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const skip = (page - 1) * limit

  // Build where clause
  const where: Record<string, unknown> = {}

  if (service) {
    where.service = service
  }

  if (category) {
    where.category = category
  }

  if (search) {
    where.question = {
      contains: search,
      mode: 'insensitive',
    }
  }

  if (priority === 'high') {
    where.priority = { lte: 10 }
  } else if (priority === 'regular') {
    where.priority = { gt: 10 }
  }

  if (isActive !== null && isActive !== undefined) {
    where.isActive = isActive === 'true'
  }

  const [questions, total, services, categories] = await Promise.all([
    prisma.pAAQuestion.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { service: 'asc' }, { question: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.pAAQuestion.count({ where }),
    prisma.pAAQuestion.findMany({
      select: { service: true },
      distinct: ['service'],
      orderBy: { service: 'asc' },
    }),
    prisma.pAAQuestion.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: null } },
      orderBy: { category: 'asc' },
    }),
  ])

  return NextResponse.json({
    questions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    filters: {
      services: services.map((s) => s.service),
      categories: categories.map((c) => c.category).filter(Boolean),
    },
  })
}

/**
 * POST /api/paa-library - Create a new PAA question
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { question, service, priority, category, isActive } = body

    if (!question || !service) {
      return NextResponse.json(
        { error: 'question and service are required' },
        { status: 400 }
      )
    }

    // Check for duplicate
    const existing = await prisma.pAAQuestion.findFirst({
      where: { question, service },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A question with this text and service already exists' },
        { status: 409 }
      )
    }

    const paaQuestion = await prisma.pAAQuestion.create({
      data: {
        question,
        service,
        priority: priority || 100,
        category: category || null,
        isActive: isActive !== false,
      },
    })

    return NextResponse.json(paaQuestion, { status: 201 })
  } catch (error) {
    console.error('Failed to create PAA question:', error)
    return NextResponse.json(
      { error: 'Failed to create PAA question' },
      { status: 500 }
    )
  }
}
