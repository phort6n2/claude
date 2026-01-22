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
  generationSuccess?: boolean  // True if content generation also succeeded
  generationError?: string     // Error message if generation failed
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
 *
 * IMPORTANT: dayTimeSlotCounts tracks individual day+time combinations to prevent
 * conflicts across different day pairs that share a day (e.g., MON_WED and WED_FRI
 * both include Wednesday).
 */
async function getSlotUsage(): Promise<{
  dayPairCounts: Record<DayPairKey, number>
  slotCounts: Record<string, number> // "DAY_PAIR:SLOT" -> count
  dayUsage: Record<number, number> // day of week -> count
  dayTimeSlotCounts: Record<string, number> // "DAY:SLOT" -> count (e.g., "3:0" = Wednesday slot 0)
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
  const dayTimeSlotCounts: Record<string, number> = {} // Track individual day+time conflicts

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

      // Track individual day+time slot usage to detect cross-pair conflicts
      // e.g., MON_WED slot 0 occupies "1:0" (Monday) and "3:0" (Wednesday)
      const daySlot1 = `${DAY_PAIRS[dayPair].day1}:${slot}`
      const daySlot2 = `${DAY_PAIRS[dayPair].day2}:${slot}`
      dayTimeSlotCounts[daySlot1] = (dayTimeSlotCounts[daySlot1] || 0) + 1
      dayTimeSlotCounts[daySlot2] = (dayTimeSlotCounts[daySlot2] || 0) + 1
    }
  }

  return {
    dayPairCounts: dayPairCounts as Record<DayPairKey, number>,
    slotCounts,
    dayUsage,
    dayTimeSlotCounts,
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
 *
 * IMPORTANT: This function now checks for day+time conflicts across different day pairs.
 * For example, if a client has MON_WED at slot 0, we won't assign another client to
 * WED_FRI at slot 0 because both would post on Wednesday at the same time.
 */
export async function findBestSlot(): Promise<SlotAssignment> {
  const { slotCounts, dayUsage, dayTimeSlotCounts } = await getSlotUsage()

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

  // Try each available pair, looking for a slot with no day+time conflicts
  for (const { pair: selectedPair } of availablePairs) {
    const { min: minSlot, max: maxSlot } = getAllowedSlotRange(selectedPair)
    const pairDays = DAY_PAIRS[selectedPair]

    // Find a time slot where NEITHER day has a conflict
    // A conflict occurs when another client (with a different day pair) already
    // occupies the same day+time slot
    let bestSlot: TimeSlotIndex | null = null
    let minUsage = Infinity

    for (let slot = minSlot; slot <= maxSlot; slot++) {
      // Check if either day in this pair already has a client at this time slot
      const day1SlotKey = `${pairDays.day1}:${slot}`
      const day2SlotKey = `${pairDays.day2}:${slot}`
      const day1Conflicts = dayTimeSlotCounts[day1SlotKey] || 0
      const day2Conflicts = dayTimeSlotCounts[day2SlotKey] || 0

      // Only consider slots where both days are conflict-free
      if (day1Conflicts === 0 && day2Conflicts === 0) {
        const slotKey = `${selectedPair}:${slot}`
        const usage = slotCounts[slotKey] || 0
        if (usage < minUsage) {
          minUsage = usage
          bestSlot = slot as TimeSlotIndex
        }
      }
    }

    // Found a conflict-free slot in this day pair
    if (bestSlot !== null) {
      return { dayPair: selectedPair, timeSlot: bestSlot }
    }
  }

  // Fallback: no completely conflict-free slot found
  // Pick the slot with the minimum combined conflicts
  console.warn('[AutoScheduler] No conflict-free slots available, falling back to least-conflicting slot')

  let bestPair: DayPairKey = 'TUE_THU'
  let bestSlot: TimeSlotIndex = 0
  let minConflicts = Infinity

  for (const { pair: selectedPair } of availablePairs.length > 0 ? availablePairs : [{ pair: 'TUE_THU' as DayPairKey }]) {
    const { min: minSlot, max: maxSlot } = getAllowedSlotRange(selectedPair)
    const pairDays = DAY_PAIRS[selectedPair]

    for (let slot = minSlot; slot <= maxSlot; slot++) {
      const day1SlotKey = `${pairDays.day1}:${slot}`
      const day2SlotKey = `${pairDays.day2}:${slot}`
      const totalConflicts = (dayTimeSlotCounts[day1SlotKey] || 0) + (dayTimeSlotCounts[day2SlotKey] || 0)

      if (totalConflicts < minConflicts) {
        minConflicts = totalConflicts
        bestPair = selectedPair
        bestSlot = slot as TimeSlotIndex
      }
    }
  }

  return { dayPair: bestPair, timeSlot: bestSlot }
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
    let generationSuccess = true
    let generationError: string | undefined
    if (triggerGeneration) {
      try {
        await triggerContentGeneration(contentItem.id)
        console.log(`✅ Content generation completed for ${contentItem.id}`)
      } catch (err) {
        generationSuccess = false
        generationError = err instanceof Error ? err.message : 'Unknown error'
        console.error(`❌ Content generation failed for ${contentItem.id}:`, err)

        // FIX: Update content status to FAILED if generation fails
        // This prevents orphaned content in SCHEDULED/GENERATING status
        try {
          const currentItem = await prisma.contentItem.findUnique({
            where: { id: contentItem.id },
            select: { status: true },
          })
          // Only mark FAILED if still in SCHEDULED/GENERATING (pipeline didn't update it)
          if (currentItem && (currentItem.status === 'SCHEDULED' || currentItem.status === 'GENERATING')) {
            await prisma.contentItem.update({
              where: { id: contentItem.id },
              data: {
                status: 'FAILED',
                lastError: `Auto-schedule generation failed: ${generationError}`,
              },
            })
          }
        } catch (updateErr) {
          console.error(`Failed to update content status for ${contentItem.id}:`, updateErr)
        }
      }
    }

    return {
      success: true, // Content was created successfully
      contentItemId: contentItem.id,
      generationSuccess, // Track if generation also succeeded
      generationError,
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

// ============================================
// CONFLICT DETECTION & RESOLUTION
// ============================================

interface ScheduleConflict {
  day: number
  dayName: string
  timeSlot: number
  timeLabel: string
  clients: {
    id: string
    businessName: string
    dayPair: DayPairKey
    dayPairLabel: string
  }[]
}

/**
 * Detect scheduling conflicts where multiple clients would post at the same day+time.
 * This can happen when different day pairs share a day (e.g., MON_WED and WED_FRI both have Wednesday).
 */
export async function detectScheduleConflicts(): Promise<ScheduleConflict[]> {
  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
      scheduleDayPair: { not: null },
    },
    select: {
      id: true,
      businessName: true,
      scheduleDayPair: true,
      scheduleTimeSlot: true,
    },
  })

  const dayNames: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
  }

  // Group clients by day+timeSlot
  const dayTimeMap: Record<string, typeof clients> = {}

  for (const client of clients) {
    const dayPair = client.scheduleDayPair as DayPairKey
    const slot = client.scheduleTimeSlot ?? 0
    const pairDays = DAY_PAIRS[dayPair]

    if (pairDays) {
      // Add client to both days in their pair
      const key1 = `${pairDays.day1}:${slot}`
      const key2 = `${pairDays.day2}:${slot}`

      dayTimeMap[key1] = dayTimeMap[key1] || []
      dayTimeMap[key1].push(client)

      dayTimeMap[key2] = dayTimeMap[key2] || []
      dayTimeMap[key2].push(client)
    }
  }

  // Find conflicts (more than 1 client at same day+time)
  const conflicts: ScheduleConflict[] = []

  for (const [key, conflictingClients] of Object.entries(dayTimeMap)) {
    if (conflictingClients.length > 1) {
      const [dayStr, slotStr] = key.split(':')
      const day = parseInt(dayStr, 10)
      const slot = parseInt(slotStr, 10)

      conflicts.push({
        day,
        dayName: dayNames[day] || `Day ${day}`,
        timeSlot: slot,
        timeLabel: TIME_SLOTS[slot as TimeSlotIndex] || `Slot ${slot}`,
        clients: conflictingClients.map(c => ({
          id: c.id,
          businessName: c.businessName,
          dayPair: c.scheduleDayPair as DayPairKey,
          dayPairLabel: DAY_PAIRS[c.scheduleDayPair as DayPairKey]?.label || c.scheduleDayPair || '',
        })),
      })
    }
  }

  return conflicts
}

/**
 * Reassign a client to a new conflict-free slot.
 * Useful for fixing existing conflicts.
 */
export async function reassignClientSlot(clientId: string): Promise<SlotAssignment> {
  // First, temporarily clear the client's current slot so it's not counted in usage
  const currentClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { scheduleDayPair: true, scheduleTimeSlot: true, businessName: true },
  })

  if (!currentClient) {
    throw new Error('Client not found')
  }

  // Clear current assignment
  await prisma.client.update({
    where: { id: clientId },
    data: {
      scheduleDayPair: null,
      scheduleTimeSlot: null,
    },
  })

  // Find a new conflict-free slot
  const newSlot = await findBestSlot()

  // Assign the new slot
  await prisma.client.update({
    where: { id: clientId },
    data: {
      scheduleDayPair: newSlot.dayPair,
      scheduleTimeSlot: newSlot.timeSlot,
    },
  })

  console.log(`[AutoScheduler] Reassigned ${currentClient.businessName} from ${currentClient.scheduleDayPair}:${currentClient.scheduleTimeSlot} to ${newSlot.dayPair}:${newSlot.timeSlot}`)

  return newSlot
}

/**
 * Fix all detected conflicts by reassigning clients to conflict-free slots.
 * Returns a summary of changes made.
 */
export async function fixAllConflicts(): Promise<{
  conflictsFound: number
  clientsReassigned: number
  reassignments: { clientId: string; clientName: string; oldSlot: string; newSlot: string }[]
}> {
  const conflicts = await detectScheduleConflicts()

  if (conflicts.length === 0) {
    return { conflictsFound: 0, clientsReassigned: 0, reassignments: [] }
  }

  console.log(`[AutoScheduler] Found ${conflicts.length} scheduling conflicts, fixing...`)

  const reassignments: { clientId: string; clientName: string; oldSlot: string; newSlot: string }[] = []
  const processedClientIds = new Set<string>()

  for (const conflict of conflicts) {
    // For each conflict, keep the first client and reassign the rest
    const clientsToReassign = conflict.clients.slice(1)

    for (const client of clientsToReassign) {
      // Skip if already processed (same client can appear in multiple conflicts)
      if (processedClientIds.has(client.id)) {
        continue
      }

      try {
        const newSlot = await reassignClientSlot(client.id)
        reassignments.push({
          clientId: client.id,
          clientName: client.businessName,
          oldSlot: `${client.dayPairLabel} @ ${TIME_SLOTS[conflict.timeSlot as TimeSlotIndex]}`,
          newSlot: `${DAY_PAIRS[newSlot.dayPair].label} @ ${TIME_SLOTS[newSlot.timeSlot]}`,
        })
        processedClientIds.add(client.id)
      } catch (err) {
        console.error(`Failed to reassign client ${client.businessName}:`, err)
      }
    }
  }

  return {
    conflictsFound: conflicts.length,
    clientsReassigned: reassignments.length,
    reassignments,
  }
}
