import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Mail that gets a shop INTO their portal.
 *
 * Two messages live here. The approval email is the follow-through on the
 * intake: "what you told us is now your account, here is the door". The
 * login email is the door working every day after — the portal signs in by
 * emailed link, and until this file existed the request-a-link endpoint
 * logged the link to the server console and sent nothing, which reads as a
 * broken login to the one person it was built for.
 *
 * Both carry a magic link, so both say the same true thing about it: it
 * signs you straight in, it expires, and a fresh one is always one tap away
 * at the login page. Nothing here promises timing on anything a human still
 * has to do — site builds are announced when they are done, not scheduled.
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

export function portalVerifyUrl(token: string): string {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://glassleads.app'
  return `${base}/portal/auth/verify?token=${token}`
}

async function sendMail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await secret('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' }

  const configured = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
  const address = /<([^>]+)>/.exec(configured)?.[1] || configured

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    // Same address the lead alerts come from, on purpose — the welcome email
    // asked them to whitelist it, and every message that arrives from it
    // reinforces that the whitelist was worth doing.
    const sent = await resend.emails.send({
      from: `Auto Glass Marketing Pros <${address}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    if (sent.error) return { ok: false, error: sent.error.message }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}

function shell(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">${inner}</div>
</body></html>`
}

const button = (url: string, label: string) =>
  `<p style="margin:0 0 24px">
    <a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px;font-size:16px">${esc(label)}</a>
  </p>`

/** The everyday login email. One link, nothing else competing with it. */
export async function sendMagicLinkEmail(input: {
  to: string
  businessName: string
  url: string
}): Promise<{ ok: boolean; error?: string }> {
  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:22px">Sign in to your portal</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.55">This link signs you straight in to the ${esc(input.businessName)} portal — no password.</p>
    ${button(input.url, 'Open my portal')}
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this into your browser:</p>
    <p style="margin:0 0 18px;font-size:13px;word-break:break-all"><a href="${esc(input.url)}" style="color:#2563eb">${esc(input.url)}</a></p>
    <p style="margin:0;font-size:13px;color:#6b7280">The link expires in 24 hours and works once. If you didn't ask for it, ignore this — nobody gets in without it.</p>`)
  const text = [
    'Sign in to your portal',
    '',
    input.url,
    '',
    'The link expires in 24 hours and works once.',
  ].join('\n')
  return sendMail({
    to: input.to,
    subject: `Sign in to ${input.businessName}`,
    html,
    text,
  })
}

/**
 * Sent when an intake is approved — the walkthrough's opening move.
 *
 * It answers exactly three questions: did my form go through (yes, and it is
 * now your account), where do I stand (site being built, or details applied),
 * and what do I do next (open the portal; it walks you through the rest).
 * The checklist itself lives in the portal, not here — an email cannot know
 * what they have already done by the time it is read.
 */
export async function sendApprovedEmail(input: {
  to: string
  businessName: string
  /** Magic-link URL when one could be minted; the plain login page if not. */
  url: string
  kind: 'NEW' | 'EXISTING'
}): Promise<{ ok: boolean; error?: string }> {
  const isExisting = input.kind === 'EXISTING'
  const lead = isExisting
    ? 'Your details are checked and applied, and your lead alerts now go where you told us. Your portal is ready.'
    : 'Everything you gave us is checked and in. We are building your site from it now, and you will hear from us when it is ready to look at. Your portal is already live — leads land there the moment the phone starts ringing.'

  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:22px">${esc(input.businessName)} — you're in</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.55">${lead}</p>
    ${button(input.url, 'Open my portal')}
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this into your browser:</p>
    <p style="margin:0 0 18px;font-size:13px;word-break:break-all"><a href="${esc(input.url)}" style="color:#2563eb">${esc(input.url)}</a></p>
    <div style="border-top:1px solid #e5e7eb;padding-top:18px">
      <p style="margin:0 0 10px;font-weight:700;font-size:15px">Do this first</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#374151">The portal opens with a short set-up list: send yourself a test lead alert to prove it reaches your phone, and put the portal on your home screen so a new lead is one tap away. Five minutes, once.</p>
    </div>
    <p style="margin:22px 0 0;font-size:13px;color:#6b7280">The sign-in link expires in 24 hours — after that, enter your email at the portal login and a fresh one arrives. Reply to this email if anything looks wrong.</p>`)

  const text = [
    `${input.businessName} — you're in`,
    '',
    lead,
    '',
    input.url,
    '',
    'The sign-in link expires in 24 hours; after that, request a fresh one at the portal login page.',
  ].join('\n')

  return sendMail({
    to: input.to,
    subject: isExisting
      ? `${input.businessName} — your portal is ready`
      : `${input.businessName} — approved, and your portal is live`,
    html,
    text,
  })
}
