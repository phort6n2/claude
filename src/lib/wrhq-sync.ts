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
import { prisma } from '@/lib/db'
import { siteIsLive } from '@/lib/site-preview'

export interface WrhqSyncResult {
  ok: boolean
  /** The directory slug the client is bound to, when the sync succeeded. */
  slug?: string
  /**
   * The listing's public address, ONLY when the directory returned one.
   *
   * Never composed from the slug. Doing that means guessing the directory's
   * route shape, and a confident dead link on an admin card is worse than a
   * slug printed as plain text — it sends whoever clicks it hunting a listing
   * that is fine.
   */
  url?: string
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
  /**
   * Whether the shop bills the carrier themselves.
   *
   * NOT a list of insurers. See the note above payloadFor.
   */
  filesInsuranceClaims?: boolean
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
  filesInsuranceClaims: boolean
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

/**
 * WHY NO LIST OF INSURERS.
 *
 * This sent `insurance: Client.insuranceRelationships`, and that column is
 * rendered by nothing, written by no form, defined by no comment, and empty on
 * every client. Its only reader was this line — so the first time somebody
 * filled it in, an unreviewed claim about which insurers a shop has a
 * "relationship" with would have appeared on a public directory page, which is
 * §2's "no approved by / preferred provider" rule broken by a field nobody
 * knew was wired to anything.
 *
 * `filesInsuranceClaims` goes instead. It is the flag the admin Business tab
 * actually sets, it already gates this claim across the hosted sites, and it
 * is a fact about the SHOP'S PROCESS — they bill the carrier themselves —
 * rather than a claim of endorsement BY an insurer. The directory can render
 * it truthfully; the list could not be rendered truthfully at all.
 */
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
    /* THE SAME RULE THAT DECIDES WHETHER THEIR WEBSITE IS PUBLIC.
       This read `=== 'ACTIVE'`, which quietly dropped the Partner tier for
       every ONBOARDING client — and ONBOARDING sites are live to the public
       on purpose (see LIVE_STATUSES). So a shop whose site was up, taking
       leads and being paid for got a demoted directory listing, and the
       intake-approval sync created every new client that way. PAUSED is the
       kill switch and stays one; the directory keeps the listing and the
       binding either way, so a returning client gets their page and its
       earned ranking back. */
    status: siteIsLive(client.status) ? 'active' : 'inactive',
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
    filesInsuranceClaims: client.filesInsuranceClaims,
    googlePlaceId: client.googlePlaceId || undefined,
    ...(opts?.dryRun ? { dryRun: true } : {}),
  }
}

/**
 * Store what came back, so the admin can say more than "we sent something".
 *
 * WRITTEN HERE, not at each call site, for the same reason the sync itself is
 * one function: there are four paths that push a client (create, edit, intake
 * approval, backfill) and a binding recorded by three of them is a card that
 * lies on the fourth. Never fatal — losing the note must not fail the push it
 * describes.
 *
 * A DRY RUN NEVER REACHES HERE. It is the one thing that must leave no trace:
 * the whole point is finding out what WOULD happen.
 */
async function recordSync(clientId: string, result: WrhqSyncResult): Promise<void> {
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: result.ok
        ? {
            // Only overwrite identity on success, and only when the directory
            // actually named it — a 200 with no slug must not blank a binding
            // that is already correct.
            ...(result.slug ? { wrhqSlug: result.slug } : {}),
            ...(result.url ? { wrhqUrl: result.url } : {}),
            wrhqSyncedAt: new Date(),
            wrhqError: null,
          }
        : /* The binding is KEPT on failure. A directory that is down has not
             un-listed anybody, and clearing the slug would make the card read
             "not listed" for a page that is sitting there working. */
          { wrhqError: result.error ?? 'Sync failed' },
    })
  } catch (e) {
    console.error('[wrhq-sync] could not record result', e)
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
  // Not configured is not a failure and must not be recorded as one: an
  // environment with no directory would otherwise show every client as broken.
  if (!url || !secret) return { ok: false, skipped: true }

  const payload = payloadFor(client, opts)
  if (!payload) {
    const result = {
      ok: false,
      error: 'This client has no city, or a state that is not two letters, so the directory cannot place a listing.',
    }
    if (!opts?.dryRun) await recordSync(client.id, result)
    return result
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
      const result = { ok: false, error }
      if (!opts?.dryRun) await recordSync(client.id, result)
      return result
    }
    const result: WrhqSyncResult = {
      ok: true,
      slug: typeof json.slug === 'string' ? json.slug : undefined,
      url: typeof json.url === 'string' && /^https?:\/\//.test(json.url) ? json.url : undefined,
      created: json.created === true,
      // Only a dry run returns this, and it is the whole point of one: whether
      // this client is already in the directory or would get a new page.
      ...(json.dryRun === true ? { wouldCreate: json.wouldCreate === true } : {}),
      matchedOn: typeof json.matchedOn === 'string' ? json.matchedOn : undefined,
    }
    if (!opts?.dryRun) await recordSync(client.id, result)
    return result
  } catch (e) {
    console.error('[wrhq-sync] send failed', e)
    const result = { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
    if (!opts?.dryRun) await recordSync(client.id, result)
    return result
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
  filesInsuranceClaims: true,
  domains: { select: { domain: true, isPrimary: true } },
} as const
