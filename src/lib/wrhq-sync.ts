// ============================================
// AGMP → WINDSHIELD REPAIR HQ (directory sync)
// ============================================
// Every shop on this platform should also be a Partner listing on
// windshieldrepairhq.com — top of their city, Partner badge, no ads on their
// page, outbound link and quote form. That used to be a manual step in another
// repo that needed a redeploy, so in practice it never happened.
//
// This posts the client to the directory's sync endpoint, which matches them
// against the ~3,000 listings it already holds and only creates a new one if
// they genuinely are not there. That matching lives on the directory side on
// purpose: it is the side that knows what it already has.
//
// Config:
//   WRHQ_SYNC_URL     the endpoint (absent → silent no-op, so a fresh
//                     environment simply doesn't sync rather than erroring)
//   WRHQ_SYNC_SECRET  shared with the directory; signs the body
//
// Delivery is best-effort and NEVER blocks the operation that triggered it.
// Creating a client must not fail because a different app is down — the
// directory listing is a benefit, not a prerequisite.
//
// White label note: nothing here sends anything a consumer sees. The directory
// renders the shop's own name and address; it never learns, or shows, that the
// shop is an agency client beyond the tier flag itself.

import { createHmac } from 'node:crypto'

export interface WrhqSyncResult {
  ok: boolean
  /** The directory slug the client is bound to, when the sync succeeded. */
  slug?: string
  created?: boolean
  /** Dry runs only: whether a real run would create a listing rather than match one. */
  wouldCreate?: boolean
  matchedOn?: string
  error?: string
  /** True when no WRHQ_SYNC_URL is configured — not a failure. */
  skipped?: boolean
}

/** A client, in the shape the directory's endpoint expects. */
export interface WrhqClientPayload {
  agmpClientId: string
  agmpSlug?: string
  status: 'active' | 'inactive'
  businessName: string
  phone?: string
  email?: string
  website?: string
  street?: string
  city: string
  state: string
  zip?: string
  services?: string[]
  mobileService?: boolean
  insurance?: string[]
  description?: string
  googlePlaceId?: string
  slug?: string
  dryRun?: boolean
}

/** The client fields this module reads. Keeps the Prisma select honest. */
export interface SyncableClient {
  id: string
  slug: string
  status: string
  businessName: string
  phone: string | null
  email: string | null
  streetAddress: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  siteSubdomain: string | null
  googlePlaceId: string | null
  offersMobileService: boolean
  offersWindshieldRepair: boolean
  offersWindshieldReplacement: boolean
  offersSideWindowRepair: boolean
  offersBackWindowRepair: boolean
  offersRockChipRepair: boolean
  offersSunroofRepair: boolean
  offersAdasCalibration: boolean
  insuranceRelationships: string[]
  domains?: { domain: string; isPrimary: boolean }[]
}

export function wrhqSyncEnabled(): boolean {
  return !!(process.env.WRHQ_SYNC_URL && process.env.WRHQ_SYNC_SECRET)
}

/**
 * Which website the directory listing links to.
 *
 * The shop's OWN domain first — that is the site they are paying to have rank,
 * and a directory link should point at it. The platform-hosted site is the
 * fallback so that every client gets a working link rather than none.
 *
 * Worth knowing: a listing pointing at {sub}.glassleads.app is visible to
 * anyone reading the page, and several of them make the directory's connection
 * to this agency easy to spot. Prefer giving a client a custom domain over
 * relying on this fallback.
 */
export function listingWebsite(client: SyncableClient): string | undefined {
  const primary = client.domains?.find((d) => d.isPrimary) ?? client.domains?.[0]
  if (primary?.domain) return `https://${primary.domain}`
  const host = client.siteSubdomain || client.slug
  return host ? `https://${host}.glassleads.app` : undefined
}

/**
 * The directory's service keys, from this client's service booleans.
 *
 * These strings must match the directory's own SERVICES keys exactly — its
 * endpoint filters out anything it doesn't recognise, so a wrong key here is
 * not an error anywhere, it just quietly drops the service from the listing.
 * Checked against wrhq's data.ts: they are `chip-repair` and `side-window`,
 * not the longer names the booleans here are called after.
 */
function servicesFor(c: SyncableClient): string[] {
  const s: string[] = []
  if (c.offersWindshieldRepair) s.push('windshield-repair')
  if (c.offersWindshieldReplacement) s.push('windshield-replacement')
  if (c.offersRockChipRepair) s.push('chip-repair')
  if (c.offersSideWindowRepair) s.push('side-window')
  if (c.offersBackWindowRepair) s.push('rear-window')
  if (c.offersSunroofRepair) s.push('sunroof-repair')
  if (c.offersAdasCalibration) s.push('adas-calibration')
  if (c.offersMobileService) s.push('mobile-service')
  return s
}

export function payloadFor(
  client: SyncableClient,
  opts?: { dryRun?: boolean }
): WrhqClientPayload | null {
  // The directory needs a city and a 2-letter state to place a listing at all.
  // Returning null rather than posting a half-record keeps a malformed client
  // out of the directory instead of creating a listing nobody can find.
  const city = (client.city || '').trim()
  const state = (client.state || '').trim()
  if (!city || state.length !== 2) return null

  return {
    agmpClientId: client.id,
    agmpSlug: client.slug,
    // PAUSED and anything else drop the Partner tier. The directory keeps the
    // listing and the binding, so a returning client gets their page back.
    status: client.status === 'ACTIVE' ? 'active' : 'inactive',
    businessName: client.businessName,
    phone: client.phone || undefined,
    email: client.email || undefined,
    website: listingWebsite(client),
    street: client.streetAddress || undefined,
    city,
    state,
    zip: client.postalCode || undefined,
    services: servicesFor(client),
    mobileService: client.offersMobileService,
    insurance: client.insuranceRelationships?.length
      ? client.insuranceRelationships
      : undefined,
    googlePlaceId: client.googlePlaceId || undefined,
    ...(opts?.dryRun ? { dryRun: true } : {}),
  }
}

/**
 * Push a client to the directory. Always resolves — callers can await it
 * without risking the request they are serving.
 */
export async function syncClientToWrhq(
  client: SyncableClient,
  opts?: { dryRun?: boolean }
): Promise<WrhqSyncResult> {
  const url = process.env.WRHQ_SYNC_URL
  const secret = process.env.WRHQ_SYNC_SECRET
  if (!url || !secret) return { ok: false, skipped: true }

  const payload = payloadFor(client, opts)
  if (!payload) {
    return { ok: false, error: 'Client has no city / 2-letter state, so it cannot be listed.' }
  }

  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agmp-signature': signature },
      body,
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const error = String(json.error || `Directory returned ${res.status}`)
      console.error('[wrhq-sync] failed', res.status, error)
      return { ok: false, error }
    }
    return {
      ok: true,
      slug: typeof json.slug === 'string' ? json.slug : undefined,
      created: json.created === true,
      // Only a dry run returns this, and it is the whole point of one: whether
      // this client is already in the directory or would get a new page.
      ...(json.dryRun === true ? { wouldCreate: json.wouldCreate === true } : {}),
      matchedOn: typeof json.matchedOn === 'string' ? json.matchedOn : undefined,
    }
  } catch (e) {
    console.error('[wrhq-sync] send failed', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

/** Everything syncClientToWrhq needs, for a Prisma `select`. */
export const WRHQ_SYNC_SELECT = {
  id: true,
  slug: true,
  status: true,
  businessName: true,
  phone: true,
  email: true,
  streetAddress: true,
  city: true,
  state: true,
  postalCode: true,
  siteSubdomain: true,
  googlePlaceId: true,
  offersMobileService: true,
  offersWindshieldRepair: true,
  offersWindshieldReplacement: true,
  offersSideWindowRepair: true,
  offersBackWindowRepair: true,
  offersRockChipRepair: true,
  offersSunroofRepair: true,
  offersAdasCalibration: true,
  insuranceRelationships: true,
  domains: { select: { domain: true, isPrimary: true } },
} as const
