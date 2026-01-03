import { prisma } from '@/lib/db'

interface SelectedLocation {
  id: string
  city: string
  state: string
  neighborhood: string | null
  isHeadquarters: boolean
}

/**
 * Select the next location for a client based on rotation.
 *
 * Strategy:
 * 1. Get all active locations for the client
 * 2. Sort by lastUsedAt (null first = never used, then oldest)
 * 3. Pick the first one (least recently used)
 *
 * New locations automatically join the rotation (lastUsedAt = null).
 *
 * @param clientId - The client to select a location for
 * @returns The selected location or null if no active locations exist
 */
export async function selectNextLocation(clientId: string): Promise<SelectedLocation | null> {
  // Get the least recently used location
  // nulls first means never-used locations come first
  const location = await prisma.serviceLocation.findFirst({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [
      { lastUsedAt: { sort: 'asc', nulls: 'first' } },
    ],
    select: {
      id: true,
      city: true,
      state: true,
      neighborhood: true,
      isHeadquarters: true,
    },
  })

  return location
}

/**
 * Mark a location as used (updates lastUsedAt).
 *
 * @param locationId - The location to mark as used
 */
export async function markLocationAsUsed(locationId: string): Promise<void> {
  await prisma.serviceLocation.update({
    where: { id: locationId },
    data: {
      lastUsedAt: new Date(),
    },
  })
}

/**
 * Get location rotation status for a client.
 *
 * @param clientId - The client to check
 * @returns Object with active location count and rotation info
 */
export async function getLocationRotationStatus(clientId: string): Promise<{
  activeCount: number
  neverUsedCount: number
  locations: Array<{
    id: string
    city: string
    state: string
    neighborhood: string | null
    lastUsedAt: Date | null
  }>
}> {
  const locations = await prisma.serviceLocation.findMany({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [
      { lastUsedAt: { sort: 'asc', nulls: 'first' } },
    ],
    select: {
      id: true,
      city: true,
      state: true,
      neighborhood: true,
      lastUsedAt: true,
    },
  })

  return {
    activeCount: locations.length,
    neverUsedCount: locations.filter(l => l.lastUsedAt === null).length,
    locations,
  }
}

/**
 * Get the default location for a client (their HQ or primary address).
 * Falls back to client's city/state if no service locations exist.
 *
 * @param clientId - The client to get default location for
 * @returns The default location info
 */
export async function getDefaultLocation(clientId: string): Promise<{
  city: string
  state: string
  neighborhood: string | null
  locationId: string | null
}> {
  // First try to find HQ location
  const hqLocation = await prisma.serviceLocation.findFirst({
    where: {
      clientId,
      isActive: true,
      isHeadquarters: true,
    },
    select: {
      id: true,
      city: true,
      state: true,
      neighborhood: true,
    },
  })

  if (hqLocation) {
    return {
      city: hqLocation.city,
      state: hqLocation.state,
      neighborhood: hqLocation.neighborhood,
      locationId: hqLocation.id,
    }
  }

  // Fallback to client's primary address
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      city: true,
      state: true,
    },
  })

  if (!client) {
    throw new Error(`Client not found: ${clientId}`)
  }

  return {
    city: client.city,
    state: client.state,
    neighborhood: null,
    locationId: null,
  }
}
