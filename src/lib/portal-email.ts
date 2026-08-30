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
 * The invite the OPERATOR sends when setup is done — not an approval
 * side-effect. By the time this goes out the account is real and the pieces
 * are wired, so the copy can say "ready" and mean it. It answers three
 * questions: you're in, here is the door, and here is the five-minute list
 * waiting inside. The checklist itself lives in the portal, not here — an
 * email cannot know what they have already done by the time it is read.
 */
export async function sendPortalReadyEmail(input: {
  to: string
  businessName: string
  /** Magic-link URL when one could be minted; the plain login page if not. */
  url: string
}): Promise<{ ok: boolean; error?: string }> {
  const lead =
    'Matt here — your setup is done, and your portal is ready. Every quote request and call lands there the moment it happens, and it is where you mark what turned into work.'

  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:22px">${esc(input.businessName)} — your portal is ready</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.55">${lead}</p>
    ${button(input.url, 'Open my portal')}
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this into your browser:</p>
    <p style="margin:0 0 18px;font-size:13px;word-break:break-all"><a href="${esc(input.url)}" style="color:#2563eb">${esc(input.url)}</a></p>
    <div style="border-top:1px solid #e5e7eb;padding-top:18px">
      <p style="margin:0 0 10px;font-weight:700;font-size:15px">Do this first</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#374151">The portal opens with a short set-up list: send yourself a test lead alert to prove it reaches your phone, and put the portal on your home screen so a new lead is one tap away. Five minutes, once.</p>
    </div>
    <p style="margin:22px 0 0;font-size:15px;line-height:1.5">— Matt<br /><span style="color:#6b7280;font-size:13px">Auto Glass Marketing Pros</span></p>
    <p style="margin:14px 0 0;font-size:13px;color:#6b7280">The sign-in link expires in 24 hours — after that, enter your email at the portal login and a fresh one arrives. Reply to this email and it comes straight to me.</p>`)

  const text = [
    `${input.businessName} — your portal is ready`,
    '',
    lead,
    '',
    input.url,
    '',
    'The sign-in link expires in 24 hours; after that, request a fresh one at the portal login page.',
    '',
    '— Matt, Auto Glass Marketing Pros',
  ].join('\n')

  return sendMail({
    to: input.to,
    subject: `${input.businessName} — your portal is ready`,
    html,
    text,
  })
}
