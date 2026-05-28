import { prisma } from '@/lib/db'

/**
 * Same-day lead deduplication helpers.
 *
 * When a customer contacts twice in one day (form + call, or two calls), the
 * second Lead row points at the first via duplicateOfLeadId. List views show
 * the canonical with the duplicate contacts as a timeline underneath.
 */

/**
 * Normalize a phone to the last 10 digits so we can match across different
 * HighLevel formats (+15551234567, 555-123-4567, (555) 123-4567, etc.).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

/**
 * Normalize an email for matching (lowercase, trim).
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = String(email).trim().toLowerCase()
  return trimmed || null
}

interface DedupLookupArgs {
  clientId: string
  phone?: string | null
  email?: string | null
  highlevelContactId?: string | null
  /** When the new contact happened. Defaults to now. */
  at?: Date
  /** Client's timezone for "calendar day" math. Defaults to America/Denver. */
  timezone?: string
  /** Optional: ignore this Lead id (used for backfill so a row doesn't dedupe to itself). */
  excludeLeadId?: string
}

/**
 * Compute the start/end of the calendar day containing `at` in the given
 * timezone, returned as UTC Date instances.
 */
function dayWindow(at: Date, timezone: string): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  // Construct local-midnight in that zone, then offset back to UTC.
  const localMidnightStr = `${parts.year}-${parts.month}-${parts.day}T00:00:00`
  const localMidnightAsUtc = new Date(localMidnightStr + 'Z')
  const offsetStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).format(at)
  const offsetMatch = offsetStr.match(/GMT([+-]?\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : 0
  const start = new Date(localMidnightAsUtc.getTime() - offsetHours * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start, end }
}

/**
 * Look for an existing same-day lead for this client that matches the new
 * contact. Returns the canonical (i.e. follows any existing duplicate chain
 * so we always link to the day's original).
 *
 * Matching priority:
 *   1. Phone (normalized to last 10 digits)
 *   2. Email (lowercased)
 *   3. HighLevel contact ID (exact)
 */
export async function findSameDayDuplicateCanonical(
  args: DedupLookupArgs
): Promise<{ id: string } | null> {
  const at = args.at ?? new Date()
  const timezone = args.timezone ?? 'America/Denver'
  const { start, end } = dayWindow(at, timezone)
  const exclude = args.excludeLeadId
    ? { id: { not: args.excludeLeadId } }
    : {}

  const normPhone = normalizePhone(args.phone)
  const normEmail = normalizeEmail(args.email)

  async function follow(id: string): Promise<string> {
    let current = id
    for (let i = 0; i < 5; i++) {
      const row = await prisma.lead.findUnique({
        where: { id: current },
        select: { id: true, duplicateOfLeadId: true },
      })
      if (!row?.duplicateOfLeadId) return row?.id ?? current
      current = row.duplicateOfLeadId
    }
    return current
  }

  // Phone match (most reliable). Phone is stored as the original string in
  // the DB, so we can't equality-match on the normalized form directly;
  // grab all same-day same-client candidates and filter in memory.
  if (normPhone) {
    const candidates = await prisma.lead.findMany({
      where: {
        clientId: args.clientId,
        createdAt: { gte: start, lte: end },
        phone: { not: null },
        ...exclude,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, phone: true },
    })
    for (const c of candidates) {
      if (normalizePhone(c.phone) === normPhone) {
        const canonicalId = await follow(c.id)
        return { id: canonicalId }
      }
    }
  }

  // Email fallback.
  if (normEmail) {
    const candidates = await prisma.lead.findMany({
      where: {
        clientId: args.clientId,
        createdAt: { gte: start, lte: end },
        email: { not: null },
        ...exclude,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    })
    for (const c of candidates) {
      if (normalizeEmail(c.email) === normEmail) {
        const canonicalId = await follow(c.id)
        return { id: canonicalId }
      }
    }
  }

  // HighLevel contact ID — same person across multiple events almost always
  // shares this. Useful when phone/email aren't both present.
  if (args.highlevelContactId) {
    const match = await prisma.lead.findFirst({
      where: {
        clientId: args.clientId,
        highlevelContactId: args.highlevelContactId,
        createdAt: { gte: start, lte: end },
        ...exclude,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (match) return { id: await follow(match.id) }
  }

  return null
}
