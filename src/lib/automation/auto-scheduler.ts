import { prisma } from '@/lib/db'
import { selectNextPAACombination, markPAAAsUsed, renderPAAQuestion } from './paa-selector'
import { markLocationAsUsed } from './location-rotator'

// ============================================
// SMART SCHEDULING CONFIGURATION
// ============================================

// Day pairs (non-consecutive days) - maps to JavaScript getDay() values
// Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6
export const DAY_PAIRS = {
  MON_WED: { day1: 1, day2: 3, label: 'Monday & Wednesday' },
  TUE_THU: { day1: 2, day2: 4, label: 'Tuesday & Thursday' },
  WED_FRI: { day1: 3, day2: 5, label: 'Wednesday & Friday' },
  MON_THU: { day1: 1, day2: 4, label: 'Monday & Thursday' },
  TUE_FRI: { day1: 2, day2: 5, label: 'Tuesday & Friday' },
  MON_FRI: { day1: 1, day2: 5, label: 'Monday & Friday' },
} as const

export type DayPairKey = keyof typeof DAY_PAIRS

// Time slots (UTC) - Mountain Time based
// Morning shift: 7-11 AM Mountain = 14:00-18:00 UTC (MST) / 13:00-17:00 UTC (MDT)
// Using MST (UTC-7) as baseline since it's more conservative
// Afternoon shift: 1-5 PM Mountain = 20:00-00:00 UTC (MST)
export const TIME_SLOTS = [
  '14:00', '15:00', '16:00', '17:00', '18:00',  // Morning MT (slots 0-4): 7-11 AM MST
  '20:00', '21:00', '22:00', '23:00', '00:00',  // Afternoon MT (slots 5-9): 1-5 PM MST
] as const
export type TimeSlotIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

// Max clients per day - with rolling 24h and non-consecutive posting days,
// we can safely run morning + evening shifts (staggered 12h apart)
const MAX_CLIENTS_PER_DAY = 10

// ============================================
// INTERFACES
// ============================================

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
    timeSlot?: string
  }
}

interface AutoScheduleOptions {
  triggerGeneration?: boolean  // Default true - trigger generation after creating
}

interface SlotAssignment {
  dayPair: DayPairKey
  timeSlot: TimeSlotIndex
}

// ============================================
// SLOT ASSIGNMENT LOGIC
// ============================================

/**
 * Count how many clients are assigned to each day pair and time slot.
 * Returns a map of usage counts to find least loaded slots.
 */
async function getSlotUsage(): Promise<{
  dayPairCounts: Record<DayPairKey, number>
  slotCounts: Record<string, number> // "DAY_PAIR:SLOT" -> count
  dayUsage: Record<number, number> // day of week -> count
}> {
  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
      scheduleDayPair: { not: null },
    },
    select: {
      scheduleDayPair: true,
      scheduleTimeSlot: true,
    },
  })

  const dayPairCounts: Record<string, number> = {}
  const slotCounts: Record<string, number> = {}
  const dayUsage: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  for (const client of clients) {
    const dayPair = client.scheduleDayPair as DayPairKey
    const slot = client.scheduleTimeSlot ?? 0

    // Count day pair usage
    dayPairCounts[dayPair] = (dayPairCounts[dayPair] || 0) + 1

    // Count specific slot usage
    const slotKey = `${dayPair}:${slot}`
    slotCounts[slotKey] = (slotCounts[slotKey] || 0) + 1

    // Count per-day usage (for checking 5-client-per-day limit)
    if (DAY_PAIRS[dayPair]) {
      dayUsage[DAY_PAIRS[dayPair].day1] = (dayUsage[DAY_PAIRS[dayPair].day1] || 0) + 1
      dayUsage[DAY_PAIRS[dayPair].day2] = (dayUsage[DAY_PAIRS[dayPair].day2] || 0) + 1
    }
  }

  return {
    dayPairCounts: dayPairCounts as Record<DayPairKey, number>,
    slotCounts,
    dayUsage,
  }
}

/**
 * Get the allowed time slot range for a day pair.
 * To avoid rolling 24h conflicts between consecutive days:
 * - Day pairs starting on odd days (Mon=1, Wed=3) use MORNING slots (0-4)
 * - Day pairs starting on even days (Tue=2) use EVENING slots (5-9)
 *
 * This ensures consecutive calendar days are 12h apart:
 * - Monday 6AM (morning) → Tuesday 6PM (evening) = 12h gap
 * - Tuesday 6PM (evening) → Wednesday 6AM (morning) = 12h gap
 */
function getAllowedSlotRange(dayPair: DayPairKey): { min: TimeSlotIndex; max: TimeSlotIndex } {
  const pair = DAY_PAIRS[dayPair]
  // Odd days (1,3,5) use morning, even days (2,4) use evening
  const useMorning = pair.day1 % 2 === 1
  return useMorning
    ? { min: 0, max: 4 }   // Morning: 06:00-10:00
    : { min: 5, max: 9 }   // Evening: 18:00-22:00
}

/**
 * Find the best available slot for a new client.
 * Prioritizes day pairs where both days have capacity.
 * Assigns to morning or evening shift based on day pair to avoid 24h conflicts.
 */
export async function findBestSlot(): Promise<SlotAssignment> {
  const { dayPairCounts, slotCounts, dayUsage } = await getSlotUsage()

  // Find day pairs where both days have capacity
  const availablePairs: { pair: DayPairKey; totalUsage: number }[] = []

  for (const [pairKey, pairDays] of Object.entries(DAY_PAIRS)) {
    const day1Usage = dayUsage[pairDays.day1] || 0
    const day2Usage = dayUsage[pairDays.day2] || 0

    // Both days must have capacity (5 per shift = 10 total, but we check per day)
    if (day1Usage < MAX_CLIENTS_PER_DAY && day2Usage < MAX_CLIENTS_PER_DAY) {
      availablePairs.push({
        pair: pairKey as DayPairKey,
        totalUsage: day1Usage + day2Usage,
      })
    }
  }

  // Sort by least used
  availablePairs.sort((a, b) => a.totalUsage - b.totalUsage)

  // Default to TUE_THU if nothing available
  const selectedPair = availablePairs[0]?.pair || 'TUE_THU'

  // Get allowed slot range for this day pair (morning or evening)
  const { min: minSlot, max: maxSlot } = getAllowedSlotRange(selectedPair)

  // Find least used time slot within the allowed range
  let bestSlot: TimeSlotIndex = minSlot as TimeSlotIndex
  let minUsage = Infinity

  for (let slot = minSlot; slot <= maxSlot; slot++) {
    const slotKey = `${selectedPair}:${slot}`
    const usage = slotCounts[slotKey] || 0
    if (usage < minUsage) {
      minUsage = usage
      bestSlot = slot as TimeSlotIndex
    }
  }

  return { dayPair: selectedPair, timeSlot: bestSlot }
}

/**
 * Assign a slot to a client if they don't have one.
 * Called when auto-schedule is enabled for a client.
 */
export async function assignSlotToClient(clientId: string): Promise<SlotAssignment> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { scheduleDayPair: true, scheduleTimeSlot: true },
  })

  // Already has assignment
  if (client?.scheduleDayPair && client.scheduleTimeSlot !== null) {
    return {
      dayPair: client.scheduleDayPair as DayPairKey,
      timeSlot: client.scheduleTimeSlot as TimeSlotIndex,
    }
  }

  // Find and assign best slot
  const slot = await findBestSlot()

  await prisma.client.update({
    where: { id: clientId },
    data: {
      scheduleDayPair: slot.dayPair,
      scheduleTimeSlot: slot.timeSlot,
    },
  })

  console.log(`[AutoScheduler] Assigned client ${clientId} to ${slot.dayPair} slot ${slot.timeSlot} (${TIME_SLOTS[slot.timeSlot]})`)

  return slot
}

// ============================================
// DATE CALCULATION
// ============================================

/**
 * Get the next occurrence of a specific day of week from a given date.
 */
function getNextDayOfWeek(dayOfWeek: number, fromDate: Date = new Date()): Date {
  const date = new Date(fromDate)
  date.setHours(0, 0, 0, 0)

  const currentDay = date.getDay()
  let daysToAdd = dayOfWeek - currentDay

  if (daysToAdd <= 0) {
    daysToAdd += 7
  }

  date.setDate(date.getDate() + daysToAdd)
  return date
}

/**
 * Get the next two schedule dates for a client based on their day pair.
 * Returns dates for both days in the pair for the upcoming week.
 */
export function getScheduleDatesForDayPair(dayPair: DayPairKey, fromDate: Date = new Date()): Date[] {
  const pair = DAY_PAIRS[dayPair]
  if (!pair) {
    // Fallback to Tue/Thu
    return getScheduleDatesForDayPair('TUE_THU', fromDate)
  }

  const date1 = getNextDayOfWeek(pair.day1, fromDate)
  const date2 = getNextDayOfWeek(pair.day2, fromDate)

  // Sort by date (earlier first)
  return [date1, date2].sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Legacy function for backwards compatibility.
 * Returns next Tuesday and Thursday.
 */
export function getNextTuesdayOrThursday(fromDate: Date = new Date()): Date {
  const dates = getScheduleDatesForDayPair('TUE_THU', fromDate)
  return dates[0]
}

/**
 * Legacy function for backwards compatibility.
 */
export function getNextScheduleDates(count: number, fromDate: Date = new Date()): Date[] {
  return getScheduleDatesForDayPair('TUE_THU', fromDate).slice(0, count)
}

// ============================================
// CONTENT SCHEDULING
// ============================================

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
  const { triggerGeneration = true } = options

  try {
    // Get client info including schedule slot
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        businessName: true,
        preferredPublishTime: true,
        timezone: true,
        scheduleTimeSlot: true,
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

    // Select next PAA + Location combination
    // This ensures all combinations are used before any repeat
    // e.g., 10 PAAs × 4 locations = 40 unique posts before cycling
    const combination = await selectNextPAACombination(clientId)
    if (!combination) {
      return {
        success: false,
        error: 'No active PAA questions or locations available',
        details: {
          clientId,
          clientName: client.businessName,
          paaQuestion: '',
          location: '',
          scheduledDate,
        },
      }
    }

    const { paa, location } = combination

    // Render the PAA question with location
    const renderedQuestion = renderPAAQuestion(paa.question, {
      city: location.city,
      state: location.state,
      neighborhood: location.neighborhood,
    })

    const locationString = location.neighborhood
      ? `${location.neighborhood}, ${location.city}, ${location.state}`
      : `${location.city}, ${location.state}`

    // Use time slot for scheduling (or fall back to preferred time)
    const timeSlot = client.scheduleTimeSlot !== null
      ? TIME_SLOTS[client.scheduleTimeSlot as TimeSlotIndex]
      : client.preferredPublishTime

    // Create the content item
    const contentItem = await prisma.contentItem.create({
      data: {
        clientId,
        clientPAAId: paa.id,
        serviceLocationId: location.id,
        paaQuestion: renderedQuestion,
        scheduledDate,
        scheduledTime: timeSlot,
        status: 'SCHEDULED',
      },
    })

    // Mark PAA and location as used (for legacy tracking)
    await markPAAAsUsed(paa.id)
    await markLocationAsUsed(location.id)

    // Update client's last auto-scheduled timestamp
    await prisma.client.update({
      where: { id: clientId },
      data: { lastAutoScheduledAt: new Date() },
    })

    // Trigger generation if requested
    if (triggerGeneration) {
      try {
        await triggerContentGeneration(contentItem.id)
        console.log(`✅ Content generation completed for ${contentItem.id}`)
      } catch (err) {
        console.error(`❌ Content generation failed for ${contentItem.id}:`, err)
        // Don't throw - we want to continue with other scheduled items
      }
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
        timeSlot,
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
 * Runs the full content pipeline including blog, images, podcast, short video,
 * social posts, and WRHQ publishing. Long video is skipped by default.
 */
async function triggerContentGeneration(contentItemId: string): Promise<void> {
  // Import and call the generation logic directly
  // This avoids HTTP overhead and works in the same process
  const { runContentPipeline } = await import('@/lib/pipeline/content-pipeline')

  try {
    // runContentPipeline handles all status updates internally:
    // - Sets GENERATING at start
    // - Sets PUBLISHED on success (if WordPress worked)
    // - Sets REVIEW if WordPress not configured
    // - Sets FAILED on error
    await runContentPipeline(contentItemId)
  } catch (error) {
    // Pipeline already sets FAILED status, but log the error
    console.error(`Pipeline failed for ${contentItemId}:`, error)
    throw error
  }
}

// ============================================
// WEEKLY AUTO-SCHEDULE (CRON ENTRY POINT)
// ============================================

/**
 * Run weekly auto-scheduling for all enabled clients.
 * Creates content for each client's assigned day pair.
 * Processes clients in time slot order to prevent overlap.
 */
export async function runWeeklyAutoSchedule(): Promise<{
  processed: number
  successful: number
  failed: number
  results: AutoScheduleResult[]
}> {
  console.log('[AutoScheduler] Starting weekly auto-schedule...')

  // Get all clients with auto-schedule enabled, sorted by time slot
  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
    },
    select: {
      id: true,
      businessName: true,
      autoScheduleFrequency: true,
      scheduleDayPair: true,
      scheduleTimeSlot: true,
    },
    orderBy: [
      { scheduleTimeSlot: 'asc' },
      { businessName: 'asc' },
    ],
  })

  console.log(`[AutoScheduler] Found ${clients.length} clients with auto-schedule enabled`)

  const results: AutoScheduleResult[] = []

  for (const client of clients) {
    // Ensure client has slot assignment
    let dayPair = client.scheduleDayPair as DayPairKey | null

    if (!dayPair) {
      // Auto-assign slot for new client
      const slot = await assignSlotToClient(client.id)
      dayPair = slot.dayPair
    }

    // Get dates for this client's day pair
    const datesToSchedule = getScheduleDatesForDayPair(dayPair)
      .slice(0, client.autoScheduleFrequency)

    console.log(`[AutoScheduler] Scheduling ${client.businessName} (${dayPair}) for dates:`,
      datesToSchedule.map(d => d.toISOString().split('T')[0]))

    for (const date of datesToSchedule) {
      const result = await autoScheduleForClient(client.id, date)
      results.push(result)

      // Small delay between pipeline runs for same client
      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Delay between clients to prevent overlap
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  const summary = {
    processed: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }

  console.log(`[AutoScheduler] Complete. Processed: ${summary.processed}, Success: ${summary.successful}, Failed: ${summary.failed}`)

  return summary
}

// ============================================
// CAPACITY INFO (for admin UI)
// ============================================

/**
 * Get current scheduling capacity info for display in admin.
 */
export async function getSchedulingCapacity(): Promise<{
  totalSlots: number
  usedSlots: number
  availableSlots: number
  clientsByDayPair: Record<string, number>
  dayUsage: Record<string, number>
}> {
  const { dayPairCounts, dayUsage } = await getSlotUsage()

  // Total possible: 6 day pairs × 10 time slots = 60 slots
  // But constrained by 10 clients per day limit (5 morning + 5 evening)
  // With rolling 24h limits, morning and evening shifts are 12h apart,
  // and non-consecutive posting days (48h+) keeps us within Late.dev limits
  // Practical max: ~30 clients (10 per day × 3 effective day pairs accounting for overlap)
  const totalSlots = 30 // Doubled from 15 with evening slots
  const usedSlots = Object.values(dayPairCounts).reduce((a, b) => a + b, 0)

  const dayNames: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
  }

  return {
    totalSlots,
    usedSlots,
    availableSlots: Math.max(0, totalSlots - usedSlots),
    clientsByDayPair: Object.fromEntries(
      Object.entries(dayPairCounts).map(([k, v]) => [DAY_PAIRS[k as DayPairKey]?.label || k, v])
    ),
    dayUsage: Object.fromEntries(
      Object.entries(dayUsage).map(([k, v]) => [dayNames[Number(k)] || k, v])
    ),
  }
}
