import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { toE164, telHref, smsHref, firstTextTo } from '@/lib/contact-links'

/**
 * Email and SMS alerts when a lead arrives.
 *
 * Speed to first contact decides whether a glass lead converts, so these fire
 * on the webhook's path — but they can never delay or fail it. Every send is
 * wrapped: a Resend outage, a bad Twilio number, a missing key, all degrade
 * to a logged error and a `lastError` the admin can see. A captured lead is
 * worth far more than a notification about it, and losing the lead to save
 * the alert would be the wrong trade.
 *
 * Credentials come from the Setting table (encrypted, editable in the admin)
 * and fall back to environment variables, the same pattern as the Places key.
 */

export interface LeadSummary {
  name: string
  phone: string
  email: string
  service: string
  vehicle: string
  postalCode: string
  message: string
  source: string
  leadUrl: string | null
  /* Everything else the form captured. The alert used to carry a fixed
   * subset, so the shop got an email missing the VIN and the insurance
   * details — the two things that decide whether the job is bookable and what
   * it is worth. Optional because a phone lead has none of them. */
  vin?: string
  insurance?: string
  carrier?: string
  landingPage?: string
  /* The customer's own photo of the damage. Rendered in the email rather than
   * linked, because the entire value of it is being able to look without
   * opening anything. */
  damagePhotoUrl?: string
}

async function secret(key: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env[key] || null
}

/**
 * Every captured field that has a value, in the order a dispatcher reads
 * them: what the job is, what it is on, then how to reach them.
 *
 * Empty fields are dropped rather than shown blank — a phone lead has no VIN,
 * and a row of "VIN: —" trains people to skim past the ones that do matter.
 */
function plainLines(lead: LeadSummary): string[] {
  return [
    lead.service && `Job: ${lead.service}`,
    lead.vehicle && `Vehicle: ${lead.vehicle}`,
    lead.vin && `VIN: ${lead.vin}`,
    lead.insurance && `Insurance: ${lead.insurance}`,
    lead.carrier && `Carrier: ${lead.carrier}`,
    lead.postalCode && `ZIP: ${lead.postalCode}`,
    lead.phone && `Phone: ${lead.phone}`,
    lead.email && `Email: ${lead.email}`,
    lead.message && `Notes: ${lead.message}`,
    lead.source && `Source: ${lead.source}`,
    lead.landingPage && `Page: ${lead.landingPage}`,
    lead.damagePhotoUrl && `Photo: ${lead.damagePhotoUrl}`,
  ].filter(Boolean) as string[]
}

/**
 * The SMS body.
 *
 * Kept under one segment where possible — the phone number is first after the
 * name because the only useful action on a lead alert is to call it, and a
 * dispatcher reading this on a lock screen should not have to open anything.
 */
function smsBody(businessName: string, lead: LeadSummary): string {
  const parts = [
    `New lead — ${businessName}`,
    `${lead.name} ${lead.phone}`.trim(),
    [lead.service, lead.vehicle].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return parts.join('\n').slice(0, 320)
}

function emailHtml(businessName: string, lead: LeadSummary): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const rows = plainLines(lead)
    // The photo is rendered as an image below, so a row repeating its URL
    // would just be a long unreadable string in the middle of the details.
    .filter((line) => !line.startsWith('Photo: '))
    .map((line) => {
      const [label, ...rest] = line.split(': ')
      return `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;color:#111827">${esc(rest.join(': '))}</td></tr>`
    })
    .join('')
  const tel = telHref(lead.phone)
  // The alert is read on a phone within a minute or two of the enquiry, which
  // makes it the best place the platform has to put a reply one tap away. The
  // text opens in the owner's own Messages app with a first line already
  // written — the platform sends nothing.
  //
  // `esc` is doing real work on this href, not decoration: the sms: URI
  // separates its body with `?&`, and a bare `&` inside an HTML attribute is
  // an entity reference. Left unescaped, some clients swallow it and the
  // message arrives empty.
  const sms = smsHref(
    lead.phone,
    firstTextTo({
      firstName: lead.name?.trim().split(/\s+/)[0] || null,
      businessName,
      service: lead.service,
      vehicle: lead.vehicle,
    })
  )
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">New lead</p>
    <h1 style="margin:0 0 4px;font-size:22px;color:#111827">${esc(lead.name || 'New enquiry')}</h1>
    <p style="margin:0 0 18px;color:#6b7280;font-size:14px">${esc(businessName)}</p>
    ${tel ? `<a href="${esc(tel)}" style="display:block;text-align:center;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:16px">Call ${esc(lead.phone)}</a>` : ''}
    ${sms ? `<a href="${esc(sms)}" style="display:block;text-align:center;background:#fff;color:#1d4ed8;border:1.5px solid #1d4ed8;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;font-size:16px;margin-top:8px">Text ${esc(lead.name?.trim().split(/\s+/)[0] || 'them')}</a>` : ''}
    ${
      lead.damagePhotoUrl
        ? `<a href="${esc(lead.damagePhotoUrl)}" style="display:block;margin-top:18px;text-decoration:none"><img src="${esc(lead.damagePhotoUrl)}" alt="Photo of the damage" width="472" style="width:100%;max-width:472px;border-radius:10px;border:1px solid #e5e7eb;display:block"><span style="display:block;margin-top:6px;font-size:12px;color:#6b7280">Photo sent by the customer — tap to open full size</span></a>`
        : ''
    }
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:18px">${rows}</table>
    ${lead.leadUrl ? `<p style="margin:18px 0 0"><a href="${esc(lead.leadUrl)}" style="color:#1d4ed8;font-size:14px">Open this lead</a></p>` : ''}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 0">Sent by glassleads.app the moment the form was submitted.</p>
</div></body></html>`
}

export interface NotifyResult {
  emailSent: number
  smsSent: number
  errors: string[]
}

/**
 * Tell whoever this client has nominated that a lead arrived.
 *
 * Never throws. Returns what happened so the caller can log it.
 */
export async function notifyNewLead(
  clientId: string,
  businessName: string,
  lead: LeadSummary
): Promise<NotifyResult> {
  const result: NotifyResult = { emailSent: 0, smsSent: 0, errors: [] }

  const config = await prisma.clientNotification.findUnique({ where: { clientId } }).catch(() => null)
  if (!config) return result

  const emails = config.emailEnabled ? config.emailTo.filter(Boolean) : []
  const numbers = config.smsEnabled ? config.smsTo.filter(Boolean) : []
  if (emails.length === 0 && numbers.length === 0) return result

  if (emails.length > 0) {
    const apiKey = await secret('RESEND_API_KEY')
    const from = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    if (!apiKey) {
      result.errors.push('RESEND_API_KEY is not configured')
    } else {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)
        const sent = await resend.emails.send({
          from,
          to: emails,
          subject: `New lead: ${lead.name || 'enquiry'}${lead.service ? ` — ${lead.service}` : ''}`,
          html: emailHtml(businessName, lead),
          text: [`New lead — ${businessName}`, lead.name, ...plainLines(lead)]
            .filter(Boolean)
            .join('\n'),
          // Someone hitting reply should reach the customer, not us.
          ...(lead.email ? { replyTo: lead.email } : {}),
        })
        if (sent.error) result.errors.push(`Resend: ${sent.error.message}`)
        else result.emailSent = emails.length
      } catch (error) {
        result.errors.push(`Resend: ${error instanceof Error ? error.message : 'failed'}`)
      }
    }
  }

  if (numbers.length > 0) {
    const sid = await secret('TWILIO_ACCOUNT_SID')
    const token = await secret('TWILIO_AUTH_TOKEN')
    const fromNumber = await secret('TWILIO_FROM_NUMBER')
    // A2P 10DLC attaches the registered campaign to a Messaging Service, not
    // to the bare number, and Twilio routes better when you send through the
    // service. Prefer it when one is set; fall back to the number.
    const messagingServiceSid = await secret('TWILIO_MESSAGING_SERVICE_SID')
    if (!sid || !token || !(fromNumber || messagingServiceSid)) {
      result.errors.push(
        'Twilio is not fully configured (SID, auth token, and either a from-number or a Messaging Service SID)'
      )
    } else {
      try {
        const twilio = (await import('twilio')).default
        const clientApi = twilio(sid, token)
        const body = smsBody(businessName, lead)
        // Sequential, and each failure is recorded rather than aborting the
        // rest: one bad number in the list must not silence the others.
        for (const raw of numbers) {
          const to = toE164(raw)
          if (!to) {
            result.errors.push(`Not a usable number: ${raw}`)
            continue
          }
          try {
            await clientApi.messages.create({
              to,
              body,
              ...(messagingServiceSid
                ? { messagingServiceSid }
                : { from: fromNumber as string }),
            })
            result.smsSent += 1
          } catch (error) {
            result.errors.push(`SMS to ${raw}: ${error instanceof Error ? error.message : 'failed'}`)
          }
        }
      } catch (error) {
        result.errors.push(`Twilio: ${error instanceof Error ? error.message : 'failed'}`)
      }
    }
  }

  await prisma.clientNotification
    .update({
      where: { clientId },
      data: {
        lastSentAt: new Date(),
        lastError: result.errors.length ? result.errors.join(' · ').slice(0, 500) : null,
      },
    })
    .catch(() => {})

  return result
}
