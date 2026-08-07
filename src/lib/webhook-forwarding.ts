import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

/**
 * Outbound webhook forwarding (lead fan-out).
 *
 * The lead webhook stores the lead first, then creates one WebhookDelivery row
 * per enabled destination and attempts them after the response is sent. A
 * delivery that fails (or whose attempt never ran because the function was
 * frozen) stays PENDING/FAILED and is retried by the cron sweep — a forward is
 * delayed by an outage, never lost.
 *
 * Every function here is defensive: forwarding is strictly additive to lead
 * capture, so a missing table, bad destination, or network fault must never
 * surface as a webhook error.
 */

const MAX_ATTEMPTS = 6
const ATTEMPT_TIMEOUT_MS = 10_000

/**
 * Validate a destination URL. Admin-entered, but the server POSTs to it, so
 * block the obvious SSRF shapes: non-https schemes, localhost, and private /
 * link-local IP literals.
 */
export function validateDestinationUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'Not a valid URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Destination must use https://' }
  }
  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.startsWith('[')
  ) {
    return { ok: false, error: 'Destination host is not allowed' }
  }
  return { ok: true, url: parsed.toString() }
}

/**
 * Normalize an admin-entered list of allowed browser origins. Each entry is
 * reduced to its URL origin (scheme + host + port), lowercased, deduplicated.
 * Returns the invalid entries so the API can report them instead of silently
 * dropping a typo'd domain.
 */
export function normalizeAllowedOrigins(entries: unknown): { origins: string[]; invalid: string[] } {
  if (!Array.isArray(entries)) return { origins: [], invalid: [] }
  const origins = new Set<string>()
  const invalid: string[] = []
  for (const entry of entries) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        invalid.push(trimmed)
        continue
      }
      origins.add(url.origin.toLowerCase())
    } catch {
      invalid.push(trimmed)
    }
  }
  return { origins: [...origins], invalid }
}

/**
 * Create PENDING delivery rows for every enabled destination of a client.
 * Returns the created delivery ids (empty when the client has none configured
 * or the tables don't exist yet).
 */
export async function createDeliveriesForLead(
  clientId: string,
  leadId: string,
  payload: unknown
): Promise<string[]> {
  try {
    const destinations = await prisma.webhookDestination.findMany({
      where: { clientId, enabled: true },
      select: { id: true },
    })
    if (destinations.length === 0) return []

    const deliveries = await prisma.$transaction(
      destinations.map((d) =>
        prisma.webhookDelivery.create({
          data: {
            destinationId: d.id,
            leadId,
            payload: (payload ?? {}) as Prisma.InputJsonValue,
          },
          select: { id: true },
        })
      )
    )
    return deliveries.map((d) => d.id)
  } catch (err) {
    // Table may not exist yet (code deployed before the SQL ran) or the DB
    // blipped. Lead capture must not care.
    console.error('[WebhookForwarding] Failed to create deliveries:', err)
    return []
  }
}

/**
 * POST a payload to a destination URL. Shared by real deliveries and the
 * admin "Send test" button.
 */
export async function postToDestination(
  url: string,
  payload: unknown
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
    // Read (and discard) the body so the connection is released.
    await response.text().catch(() => {})
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `Destination responded ${response.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : 'Request failed',
    }
  }
}

/**
 * Attempt (or re-attempt) one delivery and record the outcome.
 */
export async function attemptDelivery(deliveryId: string): Promise<boolean> {
  try {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { destination: { select: { url: true, enabled: true } } },
    })
    if (!delivery || delivery.status === 'SUCCESS') return true
    if (!delivery.destination.enabled) {
      // Destination was switched off after the delivery was queued: park it as
      // FAILED so the cron stops picking it up, with a clear reason.
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', lastError: 'Destination disabled' },
      })
      return false
    }

    const result = await postToDestination(delivery.destination.url, delivery.payload)

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: result.ok ? 'SUCCESS' : 'FAILED',
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        responseStatus: result.status,
        lastError: result.error,
      },
    })
    return result.ok
  } catch (err) {
    console.error(`[WebhookForwarding] Attempt failed for delivery ${deliveryId}:`, err)
    return false
  }
}

/**
 * Retry sweep used by the cron: pick up FAILED deliveries (and PENDING ones
 * whose initial attempt never ran) that are under the attempt cap and less
 * than 24h old, oldest first.
 */
export async function retryPendingDeliveries(limit = 20): Promise<{ attempted: number; succeeded: number }> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000) // 2 min
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24h

  const rows = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: MAX_ATTEMPTS },
      updatedAt: { lt: staleBefore },
      createdAt: { gt: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  let succeeded = 0
  for (const row of rows) {
    if (await attemptDelivery(row.id)) succeeded++
  }
  return { attempted: rows.length, succeeded }
}
