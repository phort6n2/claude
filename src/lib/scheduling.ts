import { prisma } from '@/lib/db'

/**
 * Scheduling utilities for Tuesday/Thursday content publishing
 */

/**
 * Check if a date is a Tuesday or Thursday
 */
export function isTuesdayOrThursday(date: Date): boolean {
  const day = date.getDay()
  return day === 2 || day === 4 // Tuesday = 2, Thursday = 4
}

/**
 * Get the day name for validation messages
 */
export function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[date.getDay()]
}

/**
 * Get the next available Tuesday or Thursday from a given date
 */
export function getNextTuesdayOrThursday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate)
  date.setHours(0, 0, 0, 0)

  while (!isTuesdayOrThursday(date)) {
    date.setDate(date.getDate() + 1)
  }

  return date
}

/**
 * Get the next N available Tuesdays/Thursdays starting from a date
 */
export function getNextAvailableDates(count: number, fromDate: Date = new Date()): Date[] {
  const dates: Date[] = []
  const current = new Date(fromDate)
  current.setHours(0, 0, 0, 0)

  while (dates.length < count) {
    if (isTuesdayOrThursday(current)) {
      dates.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * Check if a specific date already has content scheduled for a client
 */
export async function isDateOccupied(date: Date, clientId?: string): Promise<boolean> {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const whereClause: Record<string, unknown> = {
    scheduledDate: {
      gte: startOfDay,
      lte: endOfDay,
    },
    status: {
      notIn: ['FAILED', 'PAUSED'],
    },
  }

  if (clientId) {
    whereClause.clientId = clientId
  }

  const count = await prisma.contentItem.count({
    where: whereClause,
  })

  return count > 0
}

/**
 * Get all occupied dates for a given month
 */
export async function getOccupiedDatesForMonth(
  year: number,
  month: number,
  clientId?: string
): Promise<{ date: string; count: number; clientIds: string[] }[]> {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

  const whereClause: Record<string, unknown> = {
    scheduledDate: {
      gte: startOfMonth,
      lte: endOfMonth,
    },
    status: {
      notIn: ['FAILED', 'PAUSED'],
    },
  }

  if (clientId) {
    whereClause.clientId = clientId
  }

  const contentItems = await prisma.contentItem.findMany({
    where: whereClause,
    select: {
      scheduledDate: true,
      clientId: true,
    },
  })

  // Group by date
  const dateMap = new Map<string, { count: number; clientIds: Set<string> }>()

  for (const item of contentItems) {
    const dateStr = item.scheduledDate.toISOString().split('T')[0]
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, { count: 0, clientIds: new Set() })
    }
    const entry = dateMap.get(dateStr)!
    entry.count++
    entry.clientIds.add(item.clientId)
  }

  return Array.from(dateMap.entries()).map(([date, data]) => ({
    date,
    count: data.count,
    clientIds: Array.from(data.clientIds),
  }))
}

/**
 * Validate a scheduled date - returns error message or null if valid
 */
export async function validateScheduledDate(
  date: Date,
  clientId: string,
  excludeContentItemId?: string
): Promise<string | null> {
  // Check if it's a Tuesday or Thursday
  if (!isTuesdayOrThursday(date)) {
    return `Content can only be scheduled on Tuesdays or Thursdays. ${getDayName(date)} is not allowed.`
  }

  // Check if it's in the past
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date < today) {
    return 'Cannot schedule content in the past.'
  }

  // Check if this date is already occupied for this client
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const whereClause: Record<string, unknown> = {
    clientId,
    scheduledDate: {
      gte: startOfDay,
      lte: endOfDay,
    },
    status: {
      notIn: ['FAILED', 'PAUSED'],
    },
  }

  // Exclude current item when editing
  if (excludeContentItemId) {
    whereClause.id = { not: excludeContentItemId }
  }

  const existingContent = await prisma.contentItem.findFirst({
    where: whereClause,
    select: { paaQuestion: true },
  })

  if (existingContent) {
    return `This client already has content scheduled for ${date.toLocaleDateString()}: "${existingContent.paaQuestion.substring(0, 50)}..."`
  }

  return null
}

/**
 * Get the next available date for a client (not already occupied)
 */
export async function getNextAvailableDateForClient(
  clientId: string,
  fromDate: Date = new Date()
): Promise<Date> {
  const maxAttempts = 60 // Look up to 60 days ahead
  const current = new Date(fromDate)
  current.setHours(0, 0, 0, 0)

  for (let i = 0; i < maxAttempts; i++) {
    if (isTuesdayOrThursday(current)) {
      const isOccupied = await isDateOccupied(current, clientId)
      if (!isOccupied) {
        return current
      }
    }
    current.setDate(current.getDate() + 1)
  }

  // Fallback to next Tuesday/Thursday even if occupied
  return getNextTuesdayOrThursday(fromDate)
}

/**
 * Get calendar data for a month (all Tuesdays/Thursdays with their status)
 */
export async function getCalendarMonth(
  year: number,
  month: number,
  clientId?: string
): Promise<{
  date: string
  dayOfWeek: number
  isPublishDay: boolean
  isOccupied: boolean
  contentCount: number
  contentItems: { id: string; paaQuestion: string; status: string; clientName: string }[]
}[]> {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0)

  // Get all content items for this month
  const whereClause: Record<string, unknown> = {
    scheduledDate: {
      gte: startOfMonth,
      lte: new Date(endOfMonth.getTime() + 86400000), // Include end of last day
    },
  }

  if (clientId) {
    whereClause.clientId = clientId
  }

  const contentItems = await prisma.contentItem.findMany({
    where: whereClause,
    include: {
      client: {
        select: { businessName: true },
      },
    },
    orderBy: { scheduledTime: 'asc' },
  })

  // Build calendar data
  const calendarDays: {
    date: string
    dayOfWeek: number
    isPublishDay: boolean
    isOccupied: boolean
    contentCount: number
    contentItems: { id: string; paaQuestion: string; status: string; clientName: string }[]
  }[] = []

  const current = new Date(startOfMonth)
  while (current <= endOfMonth) {
    const dateStr = current.toISOString().split('T')[0]
    const dayOfWeek = current.getDay()
    const isPublishDay = dayOfWeek === 2 || dayOfWeek === 4

    const dayContent = contentItems.filter((item: { scheduledDate: Date }) => {
      const itemDate = item.scheduledDate.toISOString().split('T')[0]
      return itemDate === dateStr
    })

    calendarDays.push({
      date: dateStr,
      dayOfWeek,
      isPublishDay,
      isOccupied: dayContent.length > 0,
      contentCount: dayContent.length,
      contentItems: dayContent.map((item: { id: string; paaQuestion: string; status: string; client: { businessName: string } }) => ({
        id: item.id,
        paaQuestion: item.paaQuestion,
        status: item.status,
        clientName: item.client.businessName,
      })),
    })

    current.setDate(current.getDate() + 1)
  }

  return calendarDays
}

/**
 * Schedule short-form videos over multiple days (3 per day by default)
 */
export function calculateVideoSchedule(
  videoCount: number,
  startDate: Date,
  videosPerDay: number = 3,
  timeSlots: string[] = ['09:00', '13:00', '17:00']
): { dayNumber: number; slotNumber: number; scheduledDate: Date; scheduledTime: string }[] {
  const schedule: { dayNumber: number; slotNumber: number; scheduledDate: Date; scheduledTime: string }[] = []

  let currentDay = 1
  let currentSlot = 0
  const currentDate = new Date(startDate)
  currentDate.setHours(0, 0, 0, 0)

  for (let i = 0; i < videoCount; i++) {
    schedule.push({
      dayNumber: currentDay,
      slotNumber: currentSlot + 1,
      scheduledDate: new Date(currentDate),
      scheduledTime: timeSlots[currentSlot % timeSlots.length],
    })

    currentSlot++

    if (currentSlot >= videosPerDay) {
      currentSlot = 0
      currentDay++
      currentDate.setDate(currentDate.getDate() + 1)
    }
  }

  return schedule
}
