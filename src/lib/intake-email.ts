import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { deliverabilityGuide } from '@/lib/alert-deliverability'

/**
 * The welcome email — the first thing a shop ever receives from this
 * platform, and the one that carries the link everything else depends on.
 *
 * It does one job: get them to the form. No feature tour, no screenshots, no
 * "we're excited to have you". A shop owner reads this between jobs on a
 * phone, and the measure of it is whether the link gets tapped.
 *
 * The whitelisting instructions ride along HERE rather than waiting for the
 * form, because they are the one thing that has to happen before the first
 * real lead arrives — and this message is the proof it works: if they can
 * read this, our mail reaches them, and the sender they are being asked to
 * whitelist is the one that just landed.
 */

async function secret(key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (!row) return process.env[key] || null
    if (row.encrypted) {
      try {
        return decrypt(row.value)
      } catch {
        return null
      }
    }
    return row.value
  } catch {
    return process.env[key] || null
  }
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface WelcomeEmailInput {
  to: string
  businessName: string
  url: string
  kind: 'NEW' | 'EXISTING'
}

/** Exported so the message can be previewed and tested without sending. */
export function welcomeEmailBody(
  input: WelcomeEmailInput,
  senderEmail: string | null,
  senderSms: string | null
) {
  const isExisting = input.kind === 'EXISTING'
  const greeting = `Matt here, at Auto Glass Marketing Pros — really glad to be working with ${esc(input.businessName)}.`
  const lead = isExisting
    ? `Your site and lead tracking are already built and running. The next step is yours, and it is a quick one: this link checks that what we hold is right, and tells us where your leads should go.`
    : `The next step is yours, and it is the one everything else is built from: the form asks for what your Google Ads landing site needs — your address, what you work on, the towns you cover — and takes about ten minutes.`

  const cta = isExisting ? 'Check my details' : 'Start the form'

  // The whitelist block is deliberately above the fold on mobile: it is the
  // instruction with a deadline attached, since the first lead can arrive the
  // day the site goes live.
  const whitelist = [
    senderEmail
      ? `<li style="margin:0 0 8px"><strong>Add ${esc(senderEmail)} to your contacts.</strong> Every lead alert comes from that address, under the sender name AUTO GLASS LEAD. If it goes to spam you find out by losing a customer, so do this before the first one arrives.</li>`
      : '',
    senderSms
      ? `<li style="margin:0 0 8px"><strong>Save ${esc(senderSms)} as a contact</strong> — call it "Auto Glass Leads". On an iPhone also turn OFF Settings → Apps → Messages → Filter Unknown Senders, or the first text sits in a tab that never notifies you.</li>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  // The logo is white ink on transparency, so it gets its own dark band —
  // the same way the admin sidebar draws it. Absolute URL, because an email
  // client has no origin to resolve against.
  const base = process.env.APP_URL || 'https://glassleads.app'

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
    <div style="background:#111827;padding:22px 28px;text-align:center">
      <img src="${esc(base)}/logo.png" alt="Auto Glass Marketing Pros" width="190" style="display:inline-block;max-width:190px;height:auto" />
    </div>
    <div style="padding:28px">
    <h1 style="margin:0 0 12px;font-size:22px">${esc(input.businessName)}</h1>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.55">${greeting}</p>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.55">${lead}</p>
    <p style="margin:0 0 24px">
      <a href="${esc(input.url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px;font-size:16px">${cta}</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this into your browser:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${esc(input.url)}" style="color:#2563eb">${esc(input.url)}</a></p>
    ${
      whitelist
        ? `<div style="border-top:1px solid #e5e7eb;padding-top:18px">
      <p style="margin:0 0 10px;font-weight:700;font-size:15px">Two minutes now that save a job later</p>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5;color:#374151">${whitelist}</ul>
      <p style="margin:12px 0 0;font-size:13px;color:#6b7280">The form walks you through this again, with the steps for your specific email provider.</p>
    </div>`
        : ''
    }
    <p style="margin:22px 0 0;font-size:15px;line-height:1.5">— Matt<br /><span style="color:#6b7280;font-size:13px">Auto Glass Marketing Pros</span></p>
    <p style="margin:14px 0 0;font-size:13px;color:#6b7280">The link is yours alone — don't forward it. Reply to this email and it comes straight to me.</p>
    </div>
  </div>
</body></html>`

  const text = [
    input.businessName,
    '',
    greeting.replace(/<[^>]+>/g, ''),
    '',
    lead.replace(/<[^>]+>/g, ''),
    '',
    input.url,
    '',
    senderEmail ? `Add ${senderEmail} to your contacts — every lead alert comes from it.` : '',
    senderSms ? `Save ${senderSms} as a contact for text alerts.` : '',
    '',
    '— Matt, Auto Glass Marketing Pros',
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

/**
 * Tell the OPERATOR a form came back. The intake list shows "Waiting on you",
 * but only to someone already looking at it — and a submitted form is a shop
 * at peak momentum, so the review should happen while they still remember
 * filling it in. Same ADMIN_EMAIL convention as the delivery alerts, and it
 * never throws: losing the submission over a notification email would be
 * backwards.
 */
export async function sendIntakeSubmittedEmail(input: {
  intakeId: string
  businessName: string
  email: string
  kind: string
  seo: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  if (!to) return { sent: false, error: 'No ADMIN_EMAIL configured' }

  const apiKey = await secret('RESEND_API_KEY')
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY is not configured' }

  const base = process.env.APP_URL || 'https://glassleads.app'
  const reviewUrl = `${base}/admin/intakes/${input.intakeId}`
  const label = input.kind === 'EXISTING' ? 'existing client' : 'new shop'

  try {
    const configured = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    const address = /<([^>]+)>/.exec(configured)?.[1] || configured
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const sent = await resend.emails.send({
      from: `GlassLeads <${address}>`,
      to: [to],
      subject: `${input.businessName} submitted their intake — review it`,
      html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px">${esc(input.businessName)} finished the form</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55">${esc(label)}${input.seo ? ' · SEO plan' : ''} · sent to ${esc(input.email)}. Nothing goes live until you approve it.</p>
    <p style="margin:0 0 18px">
      <a href="${esc(reviewUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:15px">Review the answers</a>
    </p>
    <p style="margin:0;font-size:13px;word-break:break-all;color:#6b7280"><a href="${esc(reviewUrl)}" style="color:#2563eb">${esc(reviewUrl)}</a></p>
  </div>
</body></html>`,
      text: [
        `${input.businessName} finished the intake form (${label}${input.seo ? ', SEO plan' : ''}).`,
        '',
        reviewUrl,
      ].join('\n'),
    })
    if (sent.error) return { sent: false, error: sent.error.message }
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}

export async function sendWelcomeEmail(
  input: WelcomeEmailInput
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await secret('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' }

  const guide = await deliverabilityGuide()
  const configured = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
  const address = /<([^>]+)>/.exec(configured)?.[1] || configured
  const { html, text } = welcomeEmailBody(input, guide.senders.emailAddress, guide.senders.smsNumber)

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const sent = await resend.emails.send({
      // Same address the lead alerts come from, on purpose: this email asks
      // them to whitelist it, and arriving from anywhere else would teach the
      // inbox to trust the wrong sender. The display name is a person because
      // the email is from one.
      from: `Matt at Auto Glass Marketing Pros <${address}>`,
      to: [input.to],
      // "Google Ads landing site", because that is what a new shop signed up
      // expecting — most arrive for the ads management, and a subject about
      // "your site" reads like a website pitch they did not order.
      subject:
        input.kind === 'EXISTING'
          ? `${input.businessName} — switch on your lead alerts`
          : `${input.businessName} — let's build your Google Ads landing site`,
      html,
      text,
    })
    if (sent.error) return { ok: false, error: sent.error.message }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}
