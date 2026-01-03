import { prisma } from '@/lib/db'

interface SelectedPAA {
  id: string
  question: string
  priority: number
  usedCount: number
}

/**
 * Select the next PAA for a client based on usage tracking.
 *
 * Strategy:
 * 1. Prefer PAAs that have never been used (usedAt = null)
 * 2. If all PAAs have been used, pick the one with oldest usedAt (recycle)
 * 3. Order by priority within each group
 *
 * @param clientId - The client to select a PAA for
 * @returns The selected PAA or null if no active PAAs exist
 */
export async function selectNextPAA(clientId: string): Promise<SelectedPAA | null> {
  // First, try to find an unused PAA (ordered by priority)
  const unusedPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
      usedAt: null,
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

  if (unusedPAA) {
    return unusedPAA
  }

  // All PAAs have been used - recycle from the oldest
  const oldestUsedPAA = await prisma.clientPAA.findFirst({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [
      { usedAt: 'asc' },  // Oldest first
      { priority: 'asc' }, // Then by priority
    ],
    select: {
      id: true,
      question: true,
      priority: true,
      usedCount: true,
    },
  })

  return oldestUsedPAA
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
 *
 * @param clientId - The client to check
 * @returns Object with unused count, total count, and whether recycling
 */
export async function getPAAQueueStatus(clientId: string): Promise<{
  unusedCount: number
  totalCount: number
  isRecycling: boolean
}> {
  const [unusedCount, totalCount] = await Promise.all([
    prisma.clientPAA.count({
      where: {
        clientId,
        isActive: true,
        usedAt: null,
      },
    }),
    prisma.clientPAA.count({
      where: {
        clientId,
        isActive: true,
      },
    }),
  ])

  return {
    unusedCount,
    totalCount,
    isRecycling: unusedCount === 0 && totalCount > 0,
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
