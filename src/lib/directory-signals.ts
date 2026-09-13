// ============================================
// DIRECTORY SIGNALS — shops on WRHQ that are in the market
// ============================================
// windshieldrepairhq.com fires an event the moment a shop does something that
// says they are shopping: claims their listing, submits one, publishes it,
// buys Featured, loses ground in their city, or clicks through for an audit.
// This is where those land, and the reason they exist at all — a shop who has
// just typed "what frustrates you about your current marketing" into a form is
// worth ringing that afternoon, not at the next nightly export.
//
// WHAT NEVER ARRIVES HERE: consumer lead data. A quote request on the
// directory belongs to the one shop it was sent to and is never resold, never
// shared between shops, never handed to the agency as a prospect list. That
// promise is load-bearing on the far side, and the payload carries business
// data only — do not add a reader here that expects otherwise.
//
// Config: WRHQ_EVENT_SECRET, shared with the directory's AGMP_WEBHOOK_SECRET.
// Absent, the endpoint refuses everything — a missing secret must never mean
// "everything is authentic".

import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'
import { signalLabel, signalIsHot } from '@/lib/directory-signal-types'

export * from '@/lib/directory-signal-types'

/**
 * Verify the directory's signature over the RAW body.
 *
 * Raw, not re-serialised: JSON.stringify of a parsed object is not
 * byte-identical to what was signed (key order, number formatting, escapes),
 * so a re-serialised body fails verification for reasons nothing in the logs
 * would explain.
 */
export async function verifySignature(raw: string, sent: string | null): Promise<boolean> {
  const secret = process.env.WRHQ_EVENT_SECRET || (await secretSetting('WRHQ_EVENT_SECRET'))
  if (!secret) return false
  if (!sent) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(sent)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function signalsEnabled(): Promise<boolean> {
  return !!(process.env.WRHQ_EVENT_SECRET || (await secretSetting('WRHQ_EVENT_SECRET')))
}

export interface IncomingEvent {
  type?: unknown
  slug?: unknown
  name?: unknown
  email?: unknown
  phone?: unknown
  city?: unknown
  state?: unknown
  website?: unknown
  rank?: unknown
  total?: unknown
  previousRank?: unknown
  monthlyVolume?: unknown
  frustration?: unknown
  wantsMarketingHelp?: unknown
  occurredAt?: unknown
}

const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null

/**
 * Store one event, ignoring a repeat.
 *
 * The directory sends no event id and retries on a non-2xx, so the key is
 * built from what makes an event that event: its type, the shop, and when it
 * happened. Without it one claim arriving twice is two rows, and the second
 * reads as a second shop.
 */
export async function recordSignal(
  event: IncomingEvent
): Promise<{ stored: boolean; duplicate?: boolean; id?: string; error?: string }> {
  const type = str(event.type, 60)
  const name = str(event.name, 200)
  if (!type || !name) return { stored: false, error: 'An event needs a type and a shop name.' }

  const slug = str(event.slug, 200)
  const occurredRaw = str(event.occurredAt, 40)
  const occurredAt = occurredRaw && !Number.isNaN(Date.parse(occurredRaw))
    ? new Date(occurredRaw)
    : new Date()
  const dedupeKey = `${type}:${slug || name.toLowerCase()}:${occurredAt.toISOString()}`

  try {
    const row = await prisma.directorySignal.create({
      data: {
        type,
        dedupeKey,
        slug,
        name,
        email: str(event.email, 200),
        phone: str(event.phone, 40),
        city: str(event.city, 120),
        state: str(event.state, 10),
        website: str(event.website, 300),
        rank: num(event.rank),
        totalInCity: num(event.total),
        previousRank: num(event.previousRank),
        monthlyVolume: str(event.monthlyVolume, 120),
        frustration: str(event.frustration, 2000),
        wantsMarketingHelp:
          typeof event.wantsMarketingHelp === 'boolean' ? event.wantsMarketingHelp : null,
        // Raw, so a reader bug here costs a re-read rather than the signal —
        // the same reason the rank webhook payloads are kept.
        payload: event as object,
        occurredAt,
      },
      select: { id: true },
    })
    return { stored: true, id: row.id }
  } catch (e) {
    // P2002 on dedupeKey is the retry winning the race, not a failure. Saying
    // so lets the route answer 200, which is what stops the directory retrying
    // for ever over an event we already have.
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return { stored: false, duplicate: true }
    }
    console.error('[directory-signals] store failed', e)
    return { stored: false, error: e instanceof Error ? e.message : 'Could not store the event' }
  }
}

/**
 * Tell somebody a new signal arrived.
 *
 * Stamped with notifiedAt inside the same call, so a retry that slips past the
 * dedupe, or two events landing together, cannot mail the same row twice.
 * Never throws: an email that fails must not make the endpoint answer non-2xx,
 * because the directory would then retry an event that is already stored.
 */
export async function emailNewSignals(ids: string[]): Promise<{ sent: boolean; error?: string }> {
  if (!ids.length) return { sent: false }
  const rows = await prisma.directorySignal
    .findMany({ where: { id: { in: ids }, notifiedAt: null }, orderBy: { occurredAt: 'desc' } })
    .catch(() => [])
  if (!rows.length) return { sent: false }

  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  if (!to) return { sent: false, error: 'No ADMIN_EMAIL configured' }
  const apiKey = await secretSetting('RESEND_API_KEY')
  if (!apiKey) return { sent: false, error: 'No Resend API key' }

  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = process.env.APP_URL || 'https://glassleads.app'
  const hot = rows.filter((r) => signalIsHot(r.type))

  const blocks = rows
    .map((r) => {
      const where = [r.city, r.state?.toUpperCase()].filter(Boolean).join(', ')
      const lines = [
        r.phone ? `Phone: ${esc(r.phone)}` : '',
        r.email ? `Email: ${esc(r.email)}` : '',
        r.monthlyVolume ? `Says they do: ${esc(r.monthlyVolume)}` : '',
        r.rank != null
          ? `Position ${r.rank}${r.totalInCity ? ` of ${r.totalInCity}` : ''}${
              r.previousRank != null ? ` (was ${r.previousRank})` : ''
            }`
          : '',
      ].filter(Boolean)
      return `<div style="border-left:3px solid ${
        signalIsHot(r.type) ? '#dc2626' : '#d97706'
      };padding:8px 12px;margin:0 0 10px;background:#f9fafb">
        <p style="margin:0;font-weight:700;font-size:14px">${esc(r.name)}${
          where ? ` <span style="font-weight:400;color:#6b7280">— ${esc(where)}</span>` : ''
        }</p>
        <p style="margin:2px 0 0;font-size:13px;color:#374151">${esc(signalLabel(r.type))}</p>
        ${lines.length ? `<p style="margin:6px 0 0;font-size:13px;color:#374151">${lines.join('<br>')}</p>` : ''}
        ${
          r.frustration
            ? `<p style="margin:6px 0 0;font-size:13px;color:#111827;font-style:italic">“${esc(
                r.frustration
              )}”</p>`
            : ''
        }
      </div>`
    })
    .join('')

  try {
    const configured = (await secretSetting('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    const address = /<([^>]+)>/.exec(configured)?.[1] || configured
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const subject =
      rows.length === 1
        ? `${signalLabel(rows[0].type)} — ${rows[0].name}`
        : `${rows.length} shops moved on the directory`
    await resend.emails.send({
      from: `GlassLeads <${address}>`,
      to: [to],
      subject: hot.length ? subject : `Directory: ${subject}`,
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:18px">From Windshield Repair HQ</h1>
    <p style="margin:0 0 12px;font-size:13px;color:#6b7280">${rows.length} signal${
      rows.length === 1 ? '' : 's'
    }${hot.length ? ` · ${hot.length} worth a call today` : ''}</p>
    ${blocks}
    <p style="margin:18px 0 0;font-size:13px"><a href="${esc(
      base
    )}/admin/directory-signals" style="color:#2563eb">Open the list</a></p>
  </div>
</body></html>`,
    })
    await prisma.directorySignal
      .updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { notifiedAt: new Date() } })
      .catch(() => {})
    return { sent: true }
  } catch (e) {
    console.error('[directory-signals] email failed', e)
    return { sent: false, error: e instanceof Error ? e.message : 'Send failed' }
  }
}
