// ============================================
// DIRECTORY — LIFECYCLE UPSELL CAMPAIGN (email)
// ============================================
// A level-based, data-driven email drip that upsells shop owners who opted into
// marketing:
//   • Free / standard listing  →  $7/mo Featured   (uses their REAL city rank)
//   • Featured ($7)            →  AGMP managed svc  (uses their REAL lead count)
//   • Client (already AGMP)    →  left alone
//
// Every message is personalized from live data — we NEVER invent numbers. If a
// data point isn't there (e.g. zero captured leads), the copy falls back to an
// honest value angle instead of a fabricated stat.
//
// Cadence: a "smart drip" of up to 3 touches that spaces out and then goes
// quiet. It escalates only while the owner hasn't acted; the moment they upgrade
// (tier changes), they roll onto the next track or drop out.
//
// SAFETY: nothing sends unless ALL of these are set —
//   RESEND_API_KEY               (email transport, shared with notify.ts)
//   DIRECTORY_MAILING_ADDRESS    (CAN-SPAM: a real physical postal address)
//   DIRECTORY_CAMPAIGN_ENABLED=1 (an explicit on-switch)
// Until then the engine runs in preview/dry-run only and delivers no email.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { list, put, del } from '@vercel/blob'
import { blobEnabled } from './blob'
import { getShopBySlug, getCityRank } from './data'
import { listClaims } from './claims'
import { listQuotesForShop } from './quotes'
import { listMarketingConsent } from './profiles'
import { hydrateDirectory } from './listings'
import {
  featuredCheckoutUrl,
  rankUrl,
  FEATURED_PRICE_DISPLAY,
} from './agmp'
import type { Shop } from './types'

const PREFIX = 'directory/campaign'
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SITE_URL = 'https://windshieldrepairhq.com'

// Days that must pass (since the last touch) before the NEXT touch is due.
// Index = touches already sent. [0] → first touch fires as soon as eligible.
const DUE_AFTER_DAYS = [0, 14, 16]
const MAX_TOUCHES = DUE_AFTER_DAYS.length

export type CampaignTrack = 'featured' | 'agmp'

export interface CampaignState {
  slug: string
  email: string
  track: CampaignTrack
  step: number // touches sent so far (0..MAX_TOUCHES)
  startedAt: string
  lastSentAt?: string
  unsubscribed?: boolean
  completedAt?: string
}

export interface Recipient {
  slug: string
  email: string
  shop: Shop
  track: CampaignTrack
  rank: number
  total: number
  leads30: number
}

export interface PlannedSend {
  slug: string
  email: string
  track: CampaignTrack
  step: number // the touch number about to send (1-based)
  subject: string
}

export interface CampaignReport {
  enabled: boolean
  dryRun: boolean
  eligible: number
  planned: PlannedSend[]
  sent: number
  skipped: number
  errors: string[]
  reasons: { unsubscribed: number; notDue: number; completed: number }
}

// ---- config / gating ------------------------------------------------------

export function transportReady(): boolean {
  return !!process.env.RESEND_API_KEY
}

function mailingAddress(): string {
  return process.env.DIRECTORY_MAILING_ADDRESS || ''
}

/** Fully armed: transport + a compliant postal address + the explicit switch. */
export function campaignEnabled(): boolean {
  return (
    transportReady() &&
    !!mailingAddress() &&
    process.env.DIRECTORY_CAMPAIGN_ENABLED === '1' &&
    blobEnabled()
  )
}

function unsubSecret(): string {
  return (
    process.env.DIRECTORY_CAMPAIGN_SECRET ||
    process.env.DIRECTORY_ADMIN_PASSWORD ||
    process.env.DIRECTORY_UPLOAD_SECRET ||
    'wrhq-campaign'
  )
}

export function unsubToken(slug: string): string {
  return createHmac('sha256', unsubSecret()).update(`unsub:${slug}`).digest('base64url')
}

export function verifyUnsubToken(slug: string, token: string): boolean {
  const expected = unsubToken(slug)
  const a = Buffer.from(expected)
  const b = Buffer.from(token || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

function unsubUrl(slug: string): string {
  return `${SITE_URL}/api/directory/campaign/unsubscribe?slug=${encodeURIComponent(
    slug
  )}&t=${unsubToken(slug)}`
}

// ---- blob state -----------------------------------------------------------

async function readState(slug: string): Promise<CampaignState | null> {
  if (!blobEnabled()) return null
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/${slug}.json` })
    const hit = blobs.find((b) => b.pathname === `${PREFIX}/${slug}.json`)
    if (!hit) return null
    const res = await fetch(hit.url, { cache: 'no-store' })
    return (await res.json()) as CampaignState
  } catch {
    return null
  }
}

async function writeState(state: CampaignState): Promise<void> {
  if (!blobEnabled()) return
  // Overwrite in place (no random suffix) so state is addressable by slug.
  await put(`${PREFIX}/${state.slug}.json`, JSON.stringify(state), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

async function markUnsubscribed(slug: string): Promise<boolean> {
  const existing = await readState(slug)
  const state: CampaignState =
    existing ??
    {
      slug,
      email: '',
      track: 'featured',
      step: 0,
      startedAt: new Date().toISOString(),
    }
  state.unsubscribed = true
  await writeState(state)
  return true
}

// Exposed for the unsubscribe route.
export async function unsubscribeSlug(slug: string, token: string): Promise<boolean> {
  if (!verifyUnsubToken(slug, token)) return false
  return markUnsubscribed(slug)
}

/** Has this shop opted out of marketing email? Shared with the rank triggers. */
export async function isUnsubscribed(slug: string): Promise<boolean> {
  return (await readState(slug))?.unsubscribed === true
}

/** Public unsubscribe link for a shop (reused by other marketing sends). */
export function unsubscribeUrlFor(slug: string): string {
  return unsubUrl(slug)
}

// ---- segmentation ---------------------------------------------------------

function daysSince(iso?: string): number {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

/**
 * Everyone eligible for the drip: a live shop whose owner opted into marketing,
 * segmented by tier. Consent comes from two places:
 *   • the "wants marketing help" box on their original claim, and
 *   • the marketing toggle on their owner dashboard (added later).
 * The dashboard toggle wins — an explicit opt-out there overrides an old claim
 * consent, and an opt-in there enrolls owners who never checked the box. Client
 * (already-managed) shops are always excluded.
 */
export async function segmentRecipients(): Promise<Recipient[]> {
  await hydrateDirectory()
  const [claims, consent] = await Promise.all([listClaims(), listMarketingConsent()])

  // Newest consenting claim per slug wins for the email fallback.
  const claimBySlug = new Map<string, { email?: string; wants: boolean }>()
  for (const c of claims) {
    const slug = c.existingShopSlug || c.listingSlug
    if (!slug || claimBySlug.has(slug)) continue
    claimBySlug.set(slug, { email: c.email, wants: !!c.wantsMarketingHelp })
  }

  // Union of every slug either source knows about.
  const slugs = new Set<string>([...claimBySlug.keys(), ...consent.keys()])
  const out: Recipient[] = []

  for (const slug of slugs) {
    const dash = consent.get(slug) // dashboard toggle, if set
    const claim = claimBySlug.get(slug)

    // Consent decision: dashboard toggle is authoritative when present.
    let eligible: boolean
    if (dash) eligible = dash.optIn
    else eligible = !!claim?.wants
    if (!eligible) continue

    const shop = getShopBySlug(slug)
    if (!shop) continue // pending/unpublished — not live yet, nothing to upsell
    if (shop.client) continue // already an AGMP client

    // Prefer an owner-provided address; for an explicit dashboard opt-in, fall
    // back to the listing email so a willing owner is never dropped.
    const email = dash?.email || claim?.email || (dash ? shop.email : undefined)
    if (!email) continue

    const track: CampaignTrack = shop.featured ? 'agmp' : 'featured'
    const { rank, total } = getCityRank(shop)
    const quotes = await listQuotesForShop(slug).catch(() => [])
    const leads30 = quotes.filter((q) => daysSince(q.createdAt) <= 30).length

    out.push({ slug, email, shop, track, rank, total, leads30 })
  }
  return out
}

// ---- email content --------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Email {
  subject: string
  html: string
  text: string
}

function shell(slug: string, heading: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  const addr = esc(mailingAddress())
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#2563eb;padding:20px 28px;color:#ffffff;font-weight:700;font-size:16px">Windshield Repair HQ</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;color:#111827">${esc(heading)}</h1>
          <div style="color:#374151;font-size:15px;line-height:1.6">${bodyHtml}</div>
          <div style="margin:24px 0 4px">
            <a href="${esc(ctaHref)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(ctaLabel)}</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:12px;line-height:1.6">
          You're getting this because you listed your shop on Windshield Repair HQ and asked us to keep you posted on ways to get more customers.<br>
          <a href="${esc(unsubUrl(slug))}" style="color:#6b7280">Unsubscribe from these tips</a> · ${addr}
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`
}

// --- Track A: free/standard → $7 Featured (uses real rank) ---

function featuredEmail(r: Recipient, step: number): Email {
  const city = r.shop.city
  const link = featuredCheckoutUrl(r.slug, r.email) || `${SITE_URL}/directory/for-shops`
  const rankLine =
    r.total > 1
      ? `Right now <strong>${r.shop.name}</strong> sits at <strong>#${r.rank} of ${r.total}</strong> auto glass shops in ${esc(
          city
        )}.`
      : `You're listed in ${esc(city)}, and drivers there are searching for a shop like yours.`

  if (step === 1) {
    return {
      subject: `Where ${r.shop.name} ranks in ${city} — and how to move up`,
      text: `${r.shop.name} is #${r.rank} of ${r.total} auto glass shops in ${city} on Windshield Repair HQ. Featured listings show above every non-Featured shop in the city. Featured is ${FEATURED_PRICE_DISPLAY}, cancel anytime: ${link}`,
      html: shell(
        r.slug,
        `You're on the map in ${city}`,
        `<p style="margin:0 0 12px">${rankLine}</p>
         <p style="margin:0 0 12px">Featured listings appear <strong>above every shop in ${esc(
           city
         )} that isn't Featured</strong> — so you're the first name drivers see when they're deciding who to call.</p>
         <p style="margin:0 0 12px">Featured shops can also show their <strong>latest blog posts</strong> right on their listing — fresh content that keeps customers reading.</p>
         <p style="margin:0">It's ${esc(FEATURED_PRICE_DISPLAY)}, and you can cancel anytime.</p>`,
        link,
        `Feature ${r.shop.name} — ${FEATURED_PRICE_DISPLAY}`
      ),
    }
  }
  if (step === 2) {
    const body =
      r.leads30 > 0
        ? `<p style="margin:0 0 12px">In the last 30 days, <strong>${r.leads30} quote ${
            r.leads30 === 1 ? 'request' : 'requests'
          }</strong> came through ${esc(city)} shops on Windshield Repair HQ.</p>
           <p style="margin:0 0 12px">Featured shops are what drivers see first — that's who gets the call.</p>
           <p style="margin:0">Move ${esc(r.shop.name)} to the top of ${esc(city)} for ${esc(FEATURED_PRICE_DISPLAY)}.</p>`
        : `<p style="margin:0 0 12px">When a driver in ${esc(
            city
          )} needs a windshield, the shop at the top of the list gets the first call.</p>
           <p style="margin:0 0 12px">Featured puts ${esc(r.shop.name)} there — above every non-Featured shop in your city.</p>
           <p style="margin:0">${esc(FEATURED_PRICE_DISPLAY)}, cancel anytime.</p>`
    return {
      subject: `Be the first shop drivers see in ${city}`,
      text: `Featured puts ${r.shop.name} at the top of ${city} — the first shop drivers see. ${FEATURED_PRICE_DISPLAY}, cancel anytime: ${link}`,
      html: shell(r.slug, `The top spot in ${city}`, body, link, `Get the top spot — ${FEATURED_PRICE_DISPLAY}`),
    }
  }
  // step 3 — final, low pressure
  return {
    subject: `Last note about the top spot in ${city}`,
    text: `Last note — Featured is ${FEATURED_PRICE_DISPLAY} if you want the top spot in ${city}. We won't email about this again. ${link}`,
    html: shell(
      r.slug,
      `One last note`,
      `<p style="margin:0 0 12px">We'll leave it here — no more emails about this.</p>
       <p style="margin:0 0 12px">If you ever want ${esc(r.shop.name)} at the top of ${esc(
         city
       )}, Featured is ${esc(FEATURED_PRICE_DISPLAY)} and takes about a minute to set up.</p>
       <p style="margin:0">Thanks for being part of the directory.</p>`,
      link,
      `Feature my shop — ${FEATURED_PRICE_DISPLAY}`
    ),
  }
}

// --- Track B: Featured → AGMP managed (uses real lead count) ---

function agmpEmail(r: Recipient, step: number): Email {
  // Hand off to /rank with this shop's real position so AGMP's page opens on
  // the same story the email told (and attribution comes back to WRHQ).
  const link = rankUrl({ rank: r.rank, of: r.total, city: r.shop.city, shop: r.shop.name })
  const city = r.shop.city

  if (step === 1) {
    const lead =
      r.leads30 > 0
        ? `You're Featured in ${esc(city)}, and <strong>${r.leads30} quote ${
            r.leads30 === 1 ? 'request has' : 'requests have'
          }</strong> come through your listing in the last 30 days.`
        : `You're Featured in ${esc(city)} — you've got the top spot in the directory.`
    return {
      subject: `You're Featured in ${city} — want more than the directory can send?`,
      text: `You're Featured in ${city}. The directory is one channel — we can also run your Google ranking, ads, and review generation so more customers find you everywhere. Free audit: ${link}`,
      html: shell(
        r.slug,
        `Ready for more than one channel?`,
        `<p style="margin:0 0 12px">${lead}</p>
         <p style="margin:0 0 12px">The directory is one way customers find you. Our team can also grow your <strong>Google ranking, run your ads, and build up your reviews</strong> — so you show up everywhere a driver looks, not just here.</p>
         <p style="margin:0">Want a free look at where your shop stands? No obligation.</p>`,
        link,
        `Get my free marketing audit`
      ),
    }
  }
  if (step === 2) {
    return {
      subject: `The shops that dominate a city do this`,
      text: `The shops that own a city show up in the map pack, in ads, and with the most reviews. That's what our managed service builds. Free audit for ${r.shop.name}: ${link}`,
      html: shell(
        r.slug,
        `What "owning" a city looks like`,
        `<p style="margin:0 0 12px">The shops that dominate ${esc(
          city
        )} aren't in one place — they're in the Google map pack, running ads, and stacking up reviews faster than anyone nearby.</p>
         <p style="margin:0 0 12px">That's exactly what our managed marketing builds for a single shop like ${esc(
           r.shop.name
         )}.</p>
         <p style="margin:0">Start with a free audit — we'll show you the gaps.</p>`,
        link,
        `See my free audit`
      ),
    }
  }
  return {
    subject: `Last note — free audit for ${r.shop.name}`,
    text: `Last note — the free audit offer for ${r.shop.name} stands whenever you're ready. We won't email about this again. ${link}`,
    html: shell(
      r.slug,
      `One last note`,
      `<p style="margin:0 0 12px">We'll leave it here — no more emails about this.</p>
       <p style="margin:0 0 12px">Whenever you want to grow beyond the directory, the free audit for ${esc(
         r.shop.name
       )} is a no-pressure place to start.</p>
       <p style="margin:0">Thanks for being a Featured shop.</p>`,
      link,
      `Grab my free audit`
    ),
  }
}

export function buildEmail(r: Recipient, step: number): Email {
  return r.track === 'agmp' ? agmpEmail(r, step) : featuredEmail(r, step)
}

// ---- transport ------------------------------------------------------------

async function sendEmail(slug: string, to: string, email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY missing')
  const from =
    process.env.DIRECTORY_FROM_EMAIL ||
    'Windshield Repair HQ <hello@windshieldrepairhq.com>'
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      // One-click unsubscribe (RFC 8058) — respected by Gmail/Apple Mail.
      headers: {
        'List-Unsubscribe': `<${unsubUrl(slug)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
}

// ---- engine ---------------------------------------------------------------

/**
 * Walk every eligible owner and send the touch that's due, advancing drip state.
 * dryRun (or a not-fully-armed config) plans without sending a single email.
 */
export async function runCampaign(opts: { dryRun?: boolean } = {}): Promise<CampaignReport> {
  const armed = campaignEnabled()
  const dryRun = opts.dryRun || !armed

  const recipients = await segmentRecipients()
  const report: CampaignReport = {
    enabled: armed,
    dryRun,
    eligible: recipients.length,
    planned: [],
    sent: 0,
    skipped: 0,
    errors: [],
    reasons: { unsubscribed: 0, notDue: 0, completed: 0 },
  }

  for (const r of recipients) {
    let state = await readState(r.slug)

    // New enrollment, or the owner upgraded and rolls onto the next track.
    if (!state || state.track !== r.track) {
      state = {
        slug: r.slug,
        email: r.email,
        track: r.track,
        step: 0,
        startedAt: new Date().toISOString(),
      }
    }
    if (state.unsubscribed) {
      report.skipped++
      report.reasons.unsubscribed++
      continue
    }
    if (state.step >= MAX_TOUCHES) {
      report.skipped++
      report.reasons.completed++
      continue
    }
    if (daysSince(state.lastSentAt) < DUE_AFTER_DAYS[state.step]) {
      report.skipped++
      report.reasons.notDue++
      continue
    }

    const touch = state.step + 1
    const email = buildEmail(r, touch)
    report.planned.push({
      slug: r.slug,
      email: r.email,
      track: r.track,
      step: touch,
      subject: email.subject,
    })

    if (dryRun) continue

    try {
      await sendEmail(r.slug, r.email, email)
      state.email = r.email
      state.step = touch
      state.lastSentAt = new Date().toISOString()
      if (state.step >= MAX_TOUCHES) state.completedAt = state.lastSentAt
      await writeState(state)
      report.sent++
    } catch (e) {
      report.errors.push(`${r.slug}: ${e instanceof Error ? e.message : 'send failed'}`)
    }
  }

  return report
}
