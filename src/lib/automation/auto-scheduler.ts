import { prisma } from '@/lib/db'
import { selectNextPAA, markPAAAsUsed, renderPAAQuestion } from './paa-selector'
import { selectNextLocation, markLocationAsUsed, getDefaultLocation } from './location-rotator'

interface AutoScheduleResult {
  success: boolean
  contentItemId?: string
  error?: string
  details: {
    clientId: string
    clientName: string
    paaQuestion: string
    location: string
    scheduledDate: Date
  }
}

interface AutoScheduleOptions {
  skipLongVideo?: boolean  // Default true - skip long-form video generation
  triggerGeneration?: boolean  // Default true - trigger generation after creating
}

/**
 * Get the next Tuesday or Thursday from a given date.
 */
export function getNextTuesdayOrThursday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate)
  const dayOfWeek = date.getDay()

  // Calculate days until next Tuesday (2) or Thursday (4)
  let daysUntilNext: number

  if (dayOfWeek < 2) {
    // Sunday (0) or Monday (1) -> next Tuesday
    daysUntilNext = 2 - dayOfWeek
  } else if (dayOfWeek === 2) {
    // Tuesday -> next Thursday (2 days)
    daysUntilNext = 2
  } else if (dayOfWeek < 4) {
    // Wednesday (3) -> next Thursday (1 day)
    daysUntilNext = 4 - dayOfWeek
  } else if (dayOfWeek === 4) {
    // Thursday -> next Tuesday (5 days)
    daysUntilNext = 5
  } else {
    // Friday (5), Saturday (6) -> next Tuesday
    daysUntilNext = (2 + 7 - dayOfWeek) % 7 || 7
  }

  date.setDate(date.getDate() + daysUntilNext)
  return date
}

/**
 * Get the next N Tuesdays and Thursdays.
 */
export function getNextScheduleDates(count: number, fromDate: Date = new Date()): Date[] {
  const dates: Date[] = []
  let currentDate = new Date(fromDate)

  while (dates.length < count) {
    currentDate = getNextTuesdayOrThursday(currentDate)
    dates.push(new Date(currentDate))
    // Move to next day to find the following Tue/Thu
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return dates
}

/**
 * Check if a content item already exists for a client on a specific date.
 */
export async function hasContentForDate(clientId: string, date: Date): Promise<boolean> {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const existingContent = await prisma.contentItem.findFirst({
    where: {
      clientId,
      scheduledDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  })

  return existingContent !== null
}

/**
 * Auto-schedule content for a single client on a specific date.
 */
export async function autoScheduleForClient(
  clientId: string,
  scheduledDate: Date,
  options: AutoScheduleOptions = {}
): Promise<AutoScheduleResult> {
  const { skipLongVideo = true, triggerGeneration = true } = options

  try {
    // Get client info
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        businessName: true,
        preferredPublishTime: true,
        timezone: true,
      },
    })

    if (!client) {
      return {
        success: false,
        error: 'Client not found',
        details: {
          clientId,
          clientName: 'Unknown',
          paaQuestion: '',
          location: '',
          scheduledDate,
        },
      }
    }

    // Check if content already exists for this date
    const hasContent = await hasContentForDate(clientId, scheduledDate)
    if (hasContent) {
      return {
        success: false,
        error: 'Content already scheduled for this date',
        details: {
          clientId,
          clientName: client.businessName,
          paaQuestion: '',
          location: '',
          scheduledDate,
        },
      }
    }

    // Select next PAA
    const paa = await selectNextPAA(clientId)
    if (!paa) {
      return {
        success: false,
        error: 'No active PAA questions available',
        details: {
          clientId,
          clientName: client.businessName,
          paaQuestion: '',
          location: '',
          scheduledDate,
        },
      }
    }

    // Select next location (or use default if no service locations)
    let location = await selectNextLocation(clientId)
    let locationId: string | null = null

    if (location) {
      locationId = location.id
    } else {
      // Fall back to default location
      const defaultLoc = await getDefaultLocation(clientId)
      location = {
        id: defaultLoc.locationId || '',
        city: defaultLoc.city,
        state: defaultLoc.state,
        neighborhood: defaultLoc.neighborhood,
        isHeadquarters: true,
      }
      locationId = defaultLoc.locationId
    }

    // Render the PAA question with location
    const renderedQuestion = renderPAAQuestion(paa.question, {
      city: location.city,
      state: location.state,
      neighborhood: location.neighborhood,
    })

    const locationString = location.neighborhood
      ? `${location.neighborhood}, ${location.city}, ${location.state}`
      : `${location.city}, ${location.state}`

    // Create the content item
    const contentItem = await prisma.contentItem.create({
      data: {
        clientId,
        clientPAAId: paa.id,
        serviceLocationId: locationId,
        paaQuestion: renderedQuestion,
        scheduledDate,
        scheduledTime: client.preferredPublishTime,
        status: 'SCHEDULED',
      },
    })

    // Mark PAA and location as used
    await markPAAAsUsed(paa.id)
    if (locationId) {
      await markLocationAsUsed(locationId)
    }

    // Update client's last auto-scheduled timestamp
    await prisma.client.update({
      where: { id: clientId },
      data: { lastAutoScheduledAt: new Date() },
    })

    // Trigger generation if requested
    if (triggerGeneration) {
      // We'll call the generate endpoint asynchronously
      // This is done via fetch to the API rather than direct pipeline call
      // to ensure proper error handling and logging
      const generateOptions = {
        blog: true,
        images: true,
        social: true,
        podcast: true,
        shortVideo: true,
        longVideo: !skipLongVideo,  // Skip by default
        wrhqBlog: true,
        wrhqSocial: true,
      }

      // Fire and forget - generation happens asynchronously
      triggerContentGeneration(contentItem.id, generateOptions).catch(err => {
        console.error(`Failed to trigger generation for content ${contentItem.id}:`, err)
      })
    }

    return {
      success: true,
      contentItemId: contentItem.id,
      details: {
        clientId,
        clientName: client.businessName,
        paaQuestion: renderedQuestion,
        location: locationString,
        scheduledDate,
      },
    }
  } catch (error) {
    console.error(`Auto-schedule error for client ${clientId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        clientId,
        clientName: 'Unknown',
        paaQuestion: '',
        location: '',
        scheduledDate,
      },
    }
  }
}

/**
 * Trigger content generation for a content item.
 * This calls the generate API endpoint.
 */
async function triggerContentGeneration(
  contentItemId: string,
  options: {
    blog?: boolean
    images?: boolean
    social?: boolean
    podcast?: boolean
    shortVideo?: boolean
    longVideo?: boolean
    wrhqBlog?: boolean
    wrhqSocial?: boolean
  }
): Promise<void> {
  // Update status to GENERATING
  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { status: 'GENERATING' },
  })

  // Import and call the generation logic directly
  // This avoids HTTP overhead and works in the same process
  const { runContentPipeline } = await import('@/lib/pipeline/content-pipeline')

  try {
    await runContentPipeline(contentItemId, {
      generateBlog: options.blog ?? true,
      generateImages: options.images ?? true,
      generateSocial: options.social ?? true,
      generatePodcast: options.podcast ?? true,
      generateShortVideo: options.shortVideo ?? true,
      generateLongVideo: options.longVideo ?? false,  // Skip by default
      generateWrhqBlog: options.wrhqBlog ?? true,
      generateWrhqSocial: options.wrhqSocial ?? true,
    })

    // Update status to REVIEW after successful generation
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: 'REVIEW' },
    })
  } catch (error) {
    // Update status to FAILED on error
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message : 'Generation failed',
      },
    })
    throw error
  }
}

/**
 * Run weekly auto-scheduling for all enabled clients.
 * Creates content for the upcoming Tuesday and Thursday.
 */
export async function runWeeklyAutoSchedule(): Promise<{
  processed: number
  successful: number
  failed: number
  results: AutoScheduleResult[]
}> {
  // Get all clients with auto-schedule enabled
  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
    },
    select: {
      id: true,
      businessName: true,
      autoScheduleFrequency: true,
    },
  })

  const results: AutoScheduleResult[] = []

  for (const client of clients) {
    // Get next Tue/Thu dates based on frequency
    const datesToSchedule = getNextScheduleDates(client.autoScheduleFrequency)

    for (const date of datesToSchedule) {
      const result = await autoScheduleForClient(client.id, date)
      results.push(result)
    }
  }

  return {
    processed: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}
