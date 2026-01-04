import { prisma } from '@/lib/db'

// Priority ranges:
// 1-999: Custom PAAs (client-specific, highest priority)
// 1000+: Standard PAAs (synced from global templates)
const STANDARD_PAA_PRIORITY_START = 1000

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
  const locationString = location.neighborhood
    ? `${location.neighborhood}, ${location.city}, ${location.state}`
    : `${location.city}, ${location.state}`

  return questionTemplate
    .replace(/\{location\}/gi, locationString)
    .replace(/\{city\}/gi, location.city)
    .replace(/\{state\}/gi, location.state)
    .replace(/\{neighborhood\}/gi, location.neighborhood || location.city)
}
