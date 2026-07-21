// ============================================
// DIRECTORY — EMAIL NOTIFICATIONS (new leads)
// ============================================
// A standard perk of a claimed listing: the owner gets an email the moment a
// customer requests a quote. Your agency address is always copied so nothing
// slips through the cracks. Sent via Resend's HTTP API — no SDK dependency —
// and degrades to a silent no-op until RESEND_API_KEY is configured, so quote
// capture never depends on email being set up.

import type { Quote } from './quotes'
import type { Shop } from './types'
import { serviceMeta } from './data'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function notificationsEnabled(): boolean {
  return !!process.env.RESEND_API_KEY
}

function fromAddress(): string {
  return (
    process.env.DIRECTORY_FROM_EMAIL ||
    'Windshield Repair HQ <leads@windshieldrepairhq.com>'
  )
}

function serviceLabel(service?: string): string | undefined {
  if (!service) return undefined
  if (service === 'other') return 'Something else'
  try {
    return serviceMeta(service as Parameters<typeof serviceMeta>[0]).label
  } catch {
    return service
  }
}

async function send(payload: Record<string, unknown>): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromAddress(), ...payload }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('[directory:notify] resend error', res.status, await res.text())
    }
  } catch (e) {
    console.error('[directory:notify] send failed', e)
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function detailRows(quote: Quote): { text: string; html: string } {
  const rows: Array<[string, string, string?]> = [
    ['Name', quote.name],
    ['Phone', quote.phone, `tel:${quote.phone}`],
  ]
  if (quote.email) rows.push(['Email', quote.email, `mailto:${quote.email}`])
  if (quote.vehicle) rows.push(['Vehicle', quote.vehicle])
  const svc = serviceLabel(quote.service)
  if (svc) rows.push(['Service', svc])
  if (quote.message) rows.push(['Message', quote.message])

  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n')
  const html = rows
    .map(([k, v, href]) => {
      const value = href
        ? `<a href="${esc(href)}" style="color:#2563eb;text-decoration:none">${esc(v)}</a>`
        : esc(v)
      return `<tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td>
        <td style="padding:6px 0;color:#111827;font-size:14px">${value}</td>
      </tr>`
    })
    .join('')
  return { text, html }
}

function wrapHtml(heading: string, intro: string, quote: Quote, footer: string): string {
  const { html } = detailRows(quote)
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#2563eb;padding:20px 28px;color:#ffffff;font-weight:700;font-size:16px">Windshield Repair HQ</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 6px;font-size:20px;color:#111827">${esc(heading)}</h1>
          <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.5">${esc(intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;margin:0 0 20px">${html}</table>
          <a href="tel:${esc(quote.phone)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Call ${esc(quote.name.split(' ')[0] || 'the customer')} now</a>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:12px;line-height:1.5">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`
}

/** Email the owner and/or the agency about a new quote request. Best-effort. */
export async function notifyNewQuote(quote: Quote, shop: Shop): Promise<void> {
  if (!notificationsEnabled()) return

  const { text } = detailRows(quote)
  const jobs: Promise<void>[] = []

  // Owner — a standard benefit of claiming the listing.
  if (shop.claimed && shop.email) {
    jobs.push(
      send({
        to: [shop.email],
        reply_to: quote.email || undefined,
        subject: `New quote request from ${quote.name}`,
        text: `You've got a new lead through Windshield Repair HQ.\n\n${text}\n\nReply or call to win the job.`,
        html: wrapHtml(
          'You’ve got a new lead 🎉',
          `A customer requested a quote from ${shop.name}. Reach out fast — the first shop to respond usually wins the job.`,
          quote,
          'You’re getting this because your listing is claimed on Windshield Repair HQ. Want more leads like this? Just reply and ask about our SEO &amp; Ads.'
        ),
      })
    )
  }

  // Agency master inbox — never miss a lead across the directory.
  const agency = process.env.DIRECTORY_NOTIFY_EMAIL
  if (agency) {
    jobs.push(
      send({
        to: [agency],
        reply_to: quote.email || undefined,
        subject: `[Lead] ${shop.name} — ${quote.name}`,
        text: `New quote request for ${shop.name} (${shop.city}, ${shop.state.toUpperCase()}).\n\n${text}`,
        html: wrapHtml(
          `New lead for ${shop.name}`,
          `${shop.city}, ${shop.state.toUpperCase()}${shop.claimed ? ' · claimed' : ' · unclaimed'}`,
          quote,
          'Directory lead — logged in your agency inbox at /directory/manage.'
        ),
      })
    )
  }

  await Promise.all(jobs)
}
