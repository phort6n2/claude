import { prisma } from '@/lib/db'

// Priority ranges:
// 1-999: Custom PAAs (client-specific, highest priority)
// 1000+: Standard PAAs (synced from global templates)
const STANDARD_PAA_PRIORITY_START = 1000

/**
 * Get the start and end of "today" in a specific timezone.
 * This ensures the PAA selector's "today" matches the client's local day,
 * not just UTC day.
 */
function getTodayBounds(timezone?: string): { todayStart: Date; todayEnd: Date } {
  const now = new Date()

  if (!timezone) {
    // Fall back to UTC
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)
    return { todayStart, todayEnd }
  }

  try {
    // Get the current date in the client's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const localDateStr = formatter.format(now) // YYYY-MM-DD format

    // Parse the local date and create UTC bounds
    // We need to find when "today" in that timezone starts/ends in UTC
    const [year, month, day] = localDateStr.split('-').map(Number)

    // Create a date at midnight in the client's timezone
    // This is tricky - we need to work backwards from the local time
    const localMidnight = new Date(`${localDateStr}T00:00:00`)

    // Get the offset for this timezone at midnight
    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
    const parts = offsetFormatter.formatToParts(localMidnight)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'UTC'

    // Parse offset like "GMT-7" or "GMT+5:30"
    let offsetHours = 0
    let offsetMinutes = 0
    const offsetMatch = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/)
    if (offsetMatch) {
      const sign = offsetMatch[1] === '+' ? 1 : -1
      offsetHours = sign * parseInt(offsetMatch[2], 10)
      offsetMinutes = sign * (parseInt(offsetMatch[3] || '0', 10))
    }

    // Calculate UTC time for local midnight
    const todayStart = new Date(Date.UTC(year, month - 1, day, -offsetHours, -offsetMinutes, 0, 0))
    const todayEnd = new Date(Date.UTC(year, month - 1, day, 23 - offsetHours, 59 - offsetMinutes, 59, 999))

    return { todayStart, todayEnd }
  } catch (err) {
    // Fallback to UTC if timezone is invalid
    console.warn(`[PAA Selector] Invalid timezone "${timezone}", falling back to UTC`)
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)
    return { todayStart, todayEnd }
  }
}

interface SelectedPAA {
  id: string
  question: string
  priority: number
  usedCount: number
  isCustom: boolean
}

/**
 * Sync standard PAAs to a client (if not already synced).
 * Standard PAAs are copied to ClientPAA with priority 1000+.
 *
 * @param clientId - The client to sync standard PAAs to
 * @returns Number of PAAs synced
 */
export async function syncStandardPAAsToClient(clientId: string): Promise<number> {
  // Get all active standard PAAs
  const standardPaas = await prisma.standardPAA.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
  })

  if (standardPaas.length === 0) {
    return 0
  }

  // Get already synced standard PAA IDs for this client
  const existingSynced = await prisma.clientPAA.findMany({
    where: {
      clientId,
      standardPaaId: { not: null },
    },
    select: { standardPaaId: true },
  })
  const syncedIds = new Set(existingSynced.map(p => p.standardPaaId))

  // Find standard PAAs that need to be synced
  const toSync = standardPaas.filter(p => !syncedIds.has(p.id))

  if (toSync.length === 0) {
    return 0
  }

  // Get current max priority for standard PAAs
  const maxPriority = await prisma.clientPAA.aggregate({
    where: {
      clientId,
      priority: { gte: STANDARD_PAA_PRIORITY_START },
    },
    _max: { priority: true },
  })
  const startPriority = Math.max(
    STANDARD_PAA_PRIORITY_START,
    (maxPriority._max.priority || STANDARD_PAA_PRIORITY_START - 1) + 1
  )

  // Create client PAAs for unsynced standard PAAs
  await prisma.clientPAA.createMany({
    data: toSync.map((standardPaa, index) => ({
      clientId,
      question: standardPaa.question,
      priority: startPriority + index,
      isActive: true,
      standardPaaId: standardPaa.id,
    })),
  })

  return toSync.length
}

/**
 * Select the next PAA for a client based on usage tracking.
 *
 * Priority Strategy:
 * 1. Custom PAAs (priority 1-999) - client-specific questions
 *    - Unused custom PAAs first (by priority)
 *    - Then oldest used custom PAAs (recycling)
 * 2. Standard PAAs (priority 1000+) - global templates
 *    - Only used after all custom PAAs have been used at least once
 *    - Unused standard PAAs first (by priority)
 *    - Then oldest used standard PAAs (recycling)
 *
 * @param clientId - The client to select a PAA for
 * @returns The selected PAA or null if no active PAAs exist
 */
export async function selectNextPAA(clientId: string): Promise<SelectedPAA | null> {
  // 1. First, try to find an unused CUSTOM PAA (priority < 1000)
  const unusedCustomPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
      usedAt: null,
      standardPaaId: null, // Custom PAAs only
    },
    orderBy: {
      priority: 'asc',
    },
    select: {
      id: true,
      question: true,
      priority: true,
      usedCount: true,
    },
  })

  if (unusedCustomPAA) {
    return { ...unusedCustomPAA, isCustom: true }
  }

  // 2. Check if we have any custom PAAs at all
  const customPaaCount = await prisma.clientPAA.count({
    where: {
      clientId,
      isActive: true,
      standardPaaId: null,
    },
  })

  // 3. If we have custom PAAs but all used, recycle from oldest custom first
  if (customPaaCount > 0) {
    const oldestCustomPAA = await prisma.clientPAA.findFirst({
      where: {
        clientId,
        isActive: true,
        standardPaaId: null,
      },
      orderBy: [
        { usedAt: 'asc' },
        { priority: 'asc' },
      ],
      select: {
        id: true,
        question: true,
        priority: true,
        usedCount: true,
      },
    })

    if (oldestCustomPAA) {
      return { ...oldestCustomPAA, isCustom: true }
    }
  }

  // 4. No custom PAAs or all exhausted - ensure standard PAAs are synced
  await syncStandardPAAsToClient(clientId)

  // 5. Try to find an unused STANDARD PAA
  const unusedStandardPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
      usedAt: null,
      standardPaaId: { not: null },
    },
    orderBy: {
      priority: 'asc',
    },
    select: {
      id: true,
      question: true,
      priority: true,
      usedCount: true,
    },
  })

  if (unusedStandardPAA) {
    return { ...unusedStandardPAA, isCustom: false }
  }

  // 6. All standard PAAs used - recycle from oldest standard
  const oldestStandardPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
      standardPaaId: { not: null },
    },
    orderBy: [
      { usedAt: 'asc' },
      { priority: 'asc' },
    ],
    select: {
      id: true,
      question: true,
      priority: true,
      usedCount: true,
    },
  })

  if (oldestStandardPAA) {
    return { ...oldestStandardPAA, isCustom: false }
  }

  // 7. Fallback: try ANY PAA (shouldn't reach here normally)
  const anyPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [
      { usedAt: 'asc' },
      { priority: 'asc' },
    ],
    select: {
      id: true,
      question: true,
      priority: true,
      usedCount: true,
    },
  })

  return anyPAA ? { ...anyPAA, isCustom: anyPAA.priority < STANDARD_PAA_PRIORITY_START } : null
}

/**
 * Mark a PAA as used (updates usedAt and increments usedCount).
 *
 * @param paaId - The PAA to mark as used
 */
export async function markPAAAsUsed(paaId: string): Promise<void> {
  await prisma.clientPAA.update({
    where: { id: paaId },
    data: {
      usedAt: new Date(),
      usedCount: { increment: 1 },
    },
  })
}

/**
 * Get PAA queue status for a client.
 * Shows separate counts for custom PAAs and standard PAAs.
 *
 * @param clientId - The client to check
 * @returns Object with custom/standard counts and recycling status
 */
export async function getPAAQueueStatus(clientId: string): Promise<{
  unusedCount: number
  totalCount: number
  isRecycling: boolean
  custom: { unused: number; total: number }
  standard: { unused: number; total: number }
}> {
  const [
    customUnused,
    customTotal,
    standardUnused,
    standardTotal,
  ] = await Promise.all([
    prisma.clientPAA.count({
      where: { clientId, isActive: true, usedAt: null, standardPaaId: null },
    }),
    prisma.clientPAA.count({
      where: { clientId, isActive: true, standardPaaId: null },
    }),
    prisma.clientPAA.count({
      where: { clientId, isActive: true, usedAt: null, standardPaaId: { not: null } },
    }),
    prisma.clientPAA.count({
      where: { clientId, isActive: true, standardPaaId: { not: null } },
    }),
  ])

  const unusedCount = customUnused + standardUnused
  const totalCount = customTotal + standardTotal

  return {
    unusedCount,
    totalCount,
    isRecycling: unusedCount === 0 && totalCount > 0,
    custom: { unused: customUnused, total: customTotal },
    standard: { unused: standardUnused, total: standardTotal },
  }
}

/**
 * Properly capitalize a string (e.g., "OREGON" -> "Oregon", "new york" -> "New York")
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Render a PAA question template with location placeholders.
 *
 * @param questionTemplate - The PAA question with placeholders like {location}, {city}, {state}
 * @param location - The location to substitute
 * @returns The rendered question
 */
export function renderPAAQuestion(
  questionTemplate: string,
  location: { city: string; state: string; neighborhood?: string | null }
): string {
  // Normalize city and state to Title Case
  const city = toTitleCase(location.city)
  const state = toTitleCase(location.state)
  const neighborhood = location.neighborhood ? toTitleCase(location.neighborhood) : null

  const locationString = neighborhood
    ? `${neighborhood}, ${city}, ${state}`
    : `${city}, ${state}`

  return questionTemplate
    .replace(/\{location\}/gi, locationString)
    .replace(/\{city\}/gi, city)
    .replace(/\{state\}/gi, state)
    .replace(/\{neighborhood\}/gi, neighborhood || city)
}

// ============================================
// PAA + LOCATION COMBINATION SELECTION
// ============================================

interface SelectedCombination {
  paa: {
    id: string
    question: string
    priority: number
    isCustom: boolean
  }
  location: {
    id: string
    city: string
    state: string
    neighborhood: string | null
  }
}

/**
 * Select the next PAA + Location combination ensuring all combinations are used.
 *
 * Strategy:
 * 1. Get all active PAAs (custom first, then standard)
 * 2. Get all active locations for the client
 * 3. Find which combinations have already been used (from ContentItem records)
 * 4. Select an unused combination, prioritizing variety:
 *    - Avoid same PAA as last post
 *    - Avoid same location as last post
 *    - Prefer lower priority PAAs (process in order)
 * 5. When all combinations exhausted, reset and start over
 *
 * This ensures: 10 PAAs × 4 locations = 40 unique posts before any repeat
 *
 * @param clientId - The client to select for
 * @param timezone - Optional timezone for "today" calculation (defaults to UTC)
 * @returns The selected PAA + Location combination, or null if none available
 */
export async function selectNextPAACombination(
  clientId: string,
  timezone?: string
): Promise<SelectedCombination | null> {
  // First, ensure standard PAAs are synced to this client
  // This is important for new clients that may not have any PAAs yet
  await syncStandardPAAsToClient(clientId)

  // Get all active PAAs for this client (custom first by priority, then standard)
  const allPaas = await prisma.clientPAA.findMany({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [
      { priority: 'asc' },
    ],
    select: {
      id: true,
      question: true,
      priority: true,
      standardPaaId: true,
    },
  })

  if (allPaas.length === 0) {
    return null
  }

  // Get all active locations for this client
  const allLocations = await prisma.serviceLocation.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: {
      id: true,
      city: true,
      state: true,
      neighborhood: true,
    },
  })

  // If no locations, we can't create combinations
  if (allLocations.length === 0) {
    return null
  }

  // Get the most recent content item to avoid repeating same PAA/location
  const lastContent = await prisma.contentItem.findFirst({
    where: {
      clientId,
      clientPAAId: { not: null },
      serviceLocationId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      clientPAAId: true,
      serviceLocationId: true,
    },
  })

  // Get combinations used TODAY (these are blocked - never duplicate same day)
  // Use timezone if provided to ensure "today" matches client's local day
  const { todayStart, todayEnd } = getTodayBounds(timezone)

  // Threshold for "stuck" GENERATING content - if older than 2 hours, don't let it block
  const stuckThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const todayCombinations = await prisma.contentItem.findMany({
    where: {
      clientId,
      clientPAAId: { not: null },
      serviceLocationId: { not: null },
      scheduledDate: {
        gte: todayStart,
        lte: todayEnd,
      },
      // Only block on active content, not FAILED
      // For GENERATING status, only block if recent (not stuck)
      OR: [
        {
          status: {
            in: ['SCHEDULED', 'PUBLISHED', 'REVIEW', 'APPROVED'],
          },
        },
        {
          status: 'GENERATING',
          createdAt: {
            gte: stuckThreshold, // Only block if GENERATING content is recent
          },
        },
      ],
    },
    select: {
      clientPAAId: true,
      serviceLocationId: true,
    },
  })

  const todaySet = new Set(
    todayCombinations.map(c => `${c.clientPAAId}:${c.serviceLocationId}`)
  )

  // Get all used combinations (PAA + Location pairs that have content - all time)
  const usedCombinations = await prisma.contentItem.findMany({
    where: {
      clientId,
      clientPAAId: { not: null },
      serviceLocationId: { not: null },
    },
    select: {
      clientPAAId: true,
      serviceLocationId: true,
    },
    distinct: ['clientPAAId', 'serviceLocationId'],
  })

  // Create a set of used combination keys for fast lookup
  const usedSet = new Set(
    usedCombinations.map(c => `${c.clientPAAId}:${c.serviceLocationId}`)
  )

  // Generate all possible combinations
  const allCombinations: Array<{
    paa: typeof allPaas[0]
    location: typeof allLocations[0]
    key: string
  }> = []

  for (const paa of allPaas) {
    for (const location of allLocations) {
      allCombinations.push({
        paa,
        location,
        key: `${paa.id}:${location.id}`,
      })
    }
  }

  // First: exclude combinations used TODAY (never duplicate same day)
  const availableToday = allCombinations.filter(c => !todaySet.has(c.key))

  if (availableToday.length === 0) {
    console.log(`[PAA Selector] All ${allCombinations.length} combinations already have content today - nothing available`)
    return null
  }

  // From today's available, find ones not used all-time
  let unusedCombinations = availableToday.filter(c => !usedSet.has(c.key))

  // If all available-today combinations have been used historically, recycle
  const isRecycling = unusedCombinations.length === 0
  if (isRecycling) {
    console.log(`[PAA Selector] All historically unused combinations have content today, recycling from ${availableToday.length} available`)
    unusedCombinations = availableToday
  }

  // Sort unused combinations to maximize variety:
  // 1. Prefer different PAA than last used
  // 2. Prefer different location than last used
  // 3. Then by PAA priority (lower = higher priority)
  unusedCombinations.sort((a, b) => {
    const aLastPaa = lastContent && a.paa.id === lastContent.clientPAAId ? 1 : 0
    const bLastPaa = lastContent && b.paa.id === lastContent.clientPAAId ? 1 : 0
    const aLastLoc = lastContent && a.location.id === lastContent.serviceLocationId ? 1 : 0
    const bLastLoc = lastContent && b.location.id === lastContent.serviceLocationId ? 1 : 0

    // First: avoid same PAA as last
    if (aLastPaa !== bLastPaa) return aLastPaa - bLastPaa
    // Second: avoid same location as last
    if (aLastLoc !== bLastLoc) return aLastLoc - bLastLoc
    // Third: by PAA priority
    return a.paa.priority - b.paa.priority
  })

  const selected = unusedCombinations[0]
  if (!selected) {
    return null
  }

  return {
    paa: {
      id: selected.paa.id,
      question: selected.paa.question,
      priority: selected.paa.priority,
      isCustom: selected.paa.standardPaaId === null,
    },
    location: {
      id: selected.location.id,
      city: selected.location.city,
      state: selected.location.state,
      neighborhood: selected.location.neighborhood,
    },
  }
}

/**
 * Get PAA combination status showing how many unique combinations have been used.
 */
export async function getPAACombinationStatus(clientId: string): Promise<{
  totalPaas: number
  totalLocations: number
  totalCombinations: number
  usedCombinations: number
  remainingCombinations: number
  isRecycling: boolean
  customPaas: number
  standardPaas: number
}> {
  const [customCount, standardCount, locationCount, usedCount] = await Promise.all([
    prisma.clientPAA.count({
      where: { clientId, isActive: true, standardPaaId: null },
    }),
    prisma.clientPAA.count({
      where: { clientId, isActive: true, standardPaaId: { not: null } },
    }),
    prisma.serviceLocation.count({
      where: { clientId, isActive: true },
    }),
    prisma.contentItem.findMany({
      where: {
        clientId,
        clientPAAId: { not: null },
        serviceLocationId: { not: null },
      },
      select: {
        clientPAAId: true,
        serviceLocationId: true,
      },
      distinct: ['clientPAAId', 'serviceLocationId'],
    }).then(items => items.length),
  ])

  const totalPaas = customCount + standardCount
  const totalCombinations = totalPaas * locationCount

  return {
    totalPaas,
    totalLocations: locationCount,
    totalCombinations,
    usedCombinations: usedCount,
    remainingCombinations: Math.max(0, totalCombinations - usedCount),
    isRecycling: usedCount >= totalCombinations && totalCombinations > 0,
    customPaas: customCount,
    standardPaas: standardCount,
  }
}
