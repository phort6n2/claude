import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface CalendarGenerationResult {
  totalGenerated: number
  startDate: Date
  endDate: Date
  byLocation: Record<string, number>
  skipped: number
}

/**
 * POST /api/clients/[id]/generate-calendar - Generate content calendar
 * Creates content items for PAA × Location combinations
 *
 * Body: {
 *   startDate?: string // ISO date, defaults to next Tuesday
 *   yearsAhead?: number // How many years of content (default 2)
 *   maxPerLocation?: number // Limit items per location (optional)
 *   preview?: boolean // If true, return preview without creating
 * }
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const {
      startDate,
      yearsAhead = 2,
      maxPerLocation,
      preview = false,
    } = body

    // Get client with locations
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        serviceLocations: {
          where: { isActive: true },
          orderBy: [{ isHeadquarters: 'desc' }, { city: 'asc' }],
        },
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    if (client.serviceLocations.length === 0) {
      return NextResponse.json(
        { error: 'No service locations configured. Add locations first.' },
        { status: 400 }
      )
    }

    // Get client's PAA questions, ordered by priority
    const paaQuestions = await prisma.clientPAA.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { priority: 'asc' },
    })

    if (paaQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No content questions configured. Add questions in client settings first.' },
        { status: 400 }
      )
    }

    // Get existing content to avoid duplicates
    const existingContent = await prisma.contentItem.findMany({
      where: { clientId: id },
      select: {
        clientPAAId: true,
        serviceLocationId: true,
        paaQuestion: true,
      },
    })

    const existingCombos = new Set(
      existingContent.map((c) => `${c.clientPAAId || ''}-${c.serviceLocationId || ''}`)
    )

    // Calculate available dates (Tuesdays and Thursdays only)
    const availableDates = getAvailableDates(
      startDate ? new Date(startDate) : undefined,
      yearsAhead
    )

    // Build content plan: PAA × Location
    const contentPlan: Array<{
      paaQuestion: typeof paaQuestions[0]
      location: typeof client.serviceLocations[0]
      scheduledDate: Date
    }> = []

    let dateIndex = 0
    let skipped = 0
    const byLocation: Record<string, number> = {}

    // Iterate through locations, then PAAs (high priority first)
    for (const paa of paaQuestions) {
      for (const location of client.serviceLocations) {
        // Skip if already exists
        const combo = `${paa.id}-${location.id}`
        if (existingCombos.has(combo)) {
          skipped++
          continue
        }

        // Check per-location limit
        if (maxPerLocation && (byLocation[location.id] || 0) >= maxPerLocation) {
          continue
        }

        // Check if we have dates left
        if (dateIndex >= availableDates.length) {
          break
        }

        contentPlan.push({
          paaQuestion: paa,
          location,
          scheduledDate: availableDates[dateIndex],
        })

        byLocation[location.id] = (byLocation[location.id] || 0) + 1
        dateIndex++
      }

      if (dateIndex >= availableDates.length) {
        break
      }
    }

    // Preview mode - return plan without creating
    if (preview) {
      const locationNames: Record<string, number> = {}
      for (const location of client.serviceLocations) {
        const count = byLocation[location.id] || 0
        const name = location.neighborhood
          ? `${location.city} (${location.neighborhood})`
          : location.city
        locationNames[name] = count
      }

      return NextResponse.json({
        preview: true,
        totalItems: contentPlan.length,
        skippedDuplicates: skipped,
        startDate: contentPlan[0]?.scheduledDate || null,
        endDate: contentPlan[contentPlan.length - 1]?.scheduledDate || null,
        byLocation: locationNames,
        sampleItems: contentPlan.slice(0, 10).map((item) => ({
          question: renderQuestion(item.paaQuestion.question, item.location),
          location: item.location.city,
          date: item.scheduledDate.toISOString().split('T')[0],
        })),
      })
    }

    // Create content items in batches
    const BATCH_SIZE = 50
    let created = 0

    for (let i = 0; i < contentPlan.length; i += BATCH_SIZE) {
      const batch = contentPlan.slice(i, i + BATCH_SIZE)

      await prisma.contentItem.createMany({
        data: batch.map((item) => ({
          clientId: id,
          clientPAAId: item.paaQuestion.id,
          serviceLocationId: item.location.id,
          paaQuestion: renderQuestion(item.paaQuestion.question, item.location),
          scheduledDate: item.scheduledDate,
          scheduledTime: client.preferredPublishTime,
          status: 'DRAFT',
        })),
        skipDuplicates: true,
      })

      created += batch.length
    }

    // Update client calendar status
    const lastDate = contentPlan[contentPlan.length - 1]?.scheduledDate
    await prisma.client.update({
      where: { id },
      data: {
        calendarGenerated: true,
        calendarGeneratedAt: new Date(),
        calendarEndDate: lastDate,
      },
    })

    const result: CalendarGenerationResult = {
      totalGenerated: created,
      startDate: contentPlan[0]?.scheduledDate || new Date(),
      endDate: lastDate || new Date(),
      byLocation: Object.fromEntries(
        client.serviceLocations.map((loc) => [
          loc.neighborhood ? `${loc.city} (${loc.neighborhood})` : loc.city,
          byLocation[loc.id] || 0,
        ])
      ),
      skipped,
    }

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Calendar generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate calendar' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/clients/[id]/generate-calendar - Get calendar status
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      calendarGenerated: true,
      calendarGeneratedAt: true,
      calendarEndDate: true,
      serviceLocations: {
        where: { isActive: true },
        select: { id: true, city: true, state: true, neighborhood: true },
      },
      _count: {
        select: { contentItems: true },
      },
    },
  })

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Get content distribution by status
  const statusCounts = await prisma.contentItem.groupBy({
    by: ['status'],
    where: { clientId: id },
    _count: { id: true },
  })

  const paaCount = await prisma.clientPAA.count({
    where: { clientId: id, isActive: true },
  })

  return NextResponse.json({
    calendarGenerated: client.calendarGenerated,
    calendarGeneratedAt: client.calendarGeneratedAt,
    calendarEndDate: client.calendarEndDate,
    totalContentItems: client._count.contentItems,
    locationsCount: client.serviceLocations.length,
    paaQuestionsCount: paaCount,
    potentialItems: paaCount * client.serviceLocations.length,
    statusDistribution: Object.fromEntries(
      statusCounts.map((s) => [s.status, s._count.id])
    ),
  })
}

/**
 * Helper: Get available publishing dates (Tuesdays and Thursdays)
 */
function getAvailableDates(
  startDate: Date = new Date(),
  yearsAhead: number = 2
): Date[] {
  const dates: Date[] = []
  const endDate = new Date(startDate)
  endDate.setFullYear(endDate.getFullYear() + yearsAhead)

  // Start from next Tuesday if start date is not Tue/Thu
  const current = new Date(startDate)
  current.setHours(9, 0, 0, 0)

  const dayOfWeek = current.getDay()
  if (dayOfWeek !== 2 && dayOfWeek !== 4) {
    // Move to next Tuesday
    const daysUntilTuesday = dayOfWeek <= 2 ? 2 - dayOfWeek : 9 - dayOfWeek
    current.setDate(current.getDate() + daysUntilTuesday)
  }

  while (current < endDate) {
    dates.push(new Date(current))

    // Alternate between Tuesday and Thursday
    if (current.getDay() === 2) {
      current.setDate(current.getDate() + 2) // Tue -> Thu
    } else {
      current.setDate(current.getDate() + 5) // Thu -> Tue
    }
  }

  return dates
}

/**
 * Helper: Render question with location substitution
 */
function renderQuestion(
  template: string,
  location: { city: string; state: string; neighborhood?: string | null }
): string {
  const locationText = location.neighborhood
    ? `${location.neighborhood}, ${location.city}`
    : `${location.city}, ${location.state}`

  return template
    .replace(/{location}/gi, locationText)
    .replace(/{city}/gi, location.city)
    .replace(/{state}/gi, location.state)
}
