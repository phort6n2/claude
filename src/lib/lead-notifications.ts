import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { toE164, telHref, smsHref, firstTextTo } from '@/lib/contact-links'
import { countSegments, fitSegments } from '@/lib/sms-segments'

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

import { formatPhoneDisplay } from '@/lib/lead-display'

export interface LeadAttribution {
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}

/**
 * Did this lead arrive on an ad click, and whose ad?
 *
 * WHY IT IS ON THE ALERT AT ALL. A shop paying for Google Ads sees a phone
 * ringing and a form arriving and has no way to tell which of them the ads
 * bought. The click id is captured, travels with the lead and is uploaded
 * back to Google when the job books — the whole attribution loop runs on it —
 * and the one person who never saw any of it was the shop owner reading the
 * alert. "Are these leads coming from the ads?" is the question behind most
 * of the calls this platform gets, and the answer was already in the record.
 *
 * A GOOGLE CLICK ID IS PROOF. Google mints gclid/gbraid/wbraid on an ad click
 * and nowhere else, so its presence is not an inference. The UTM fallback
 * below is the shop's own tagging rather than Google's word for it, which is
 * good enough for a label but is why it is second.
 *
 * Anything else returns null and the alert says nothing, rather than guessing.
 * Telling a shop a lead came from their ads when it came from their Business
 * Profile is worse than staying quiet: they judge the spend on this.
 */
export function adSourceOf(
  attribution?: LeadAttribution | null
): { network: string; campaign: string | null } | null {
  if (!attribution) return null
  const campaign = attribution.utmCampaign?.trim() || null
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) {
    return { network: 'Google Ads', campaign }
  }
  const source = (attribution.utmSource || '').toLowerCase()
  const medium = (attribution.utmMedium || '').toLowerCase()
  const paid = /cpc|ppc|paid|adwords/.test(medium)
  if (!paid) return null
  if (/google|adwords/.test(source)) return { network: 'Google Ads', campaign }
  if (/bing|microsoft|msn/.test(source)) return { network: 'Microsoft Ads', campaign }
  return null
}

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
  /* Signed one-tap link for recording whether the job booked. Absent when no
   * signing key is configured, in which case the buttons are simply omitted
   * rather than rendered dead. */
  outcomeUrl?: string | null
  /* Everything else the form captured. The alert used to carry a fixed
   * subset, so the shop got an email missing the VIN and the insurance
   * details — the two things that decide whether the job is bookable and what
   * it is worth. Optional because a phone lead has none of them. */
  vin?: string
  insurance?: string
  carrier?: string
  landingPage?: string
  /* What brought them, as captured on the lead. Passed raw rather than as a
   * finished label so the rule for "this was an ad click" lives in one place
   * — see adSourceOf below. */
  attribution?: LeadAttribution
  /* The customer's own photo of the damage. Rendered in the email rather than
   * linked, because the entire value of it is being able to look without
   * opening anything. */
  damagePhotoUrl?: string
  /* True when this lead is an inbound phone call rather than a form. The
     alert reads differently for one: there is no enquiry to read, the thing
     that happened is that somebody rang. */
  isCall?: boolean
  /* When the call came in, already rendered in the SHOP's timezone. Formatted
     at the call site because only that side knows the timezone; a UTC stamp
     here would be a different hour to the person reading it. */
  calledAtLabel?: string
  /* Decoded from the VIN. The calibration line is the reason this exists: it
   * is the priciest part of a modern windscreen job and the one most often
   * missed when quoting from the customer's description alone. */
  decodedVehicle?: string
  calibration?: string
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
    lead.decodedVehicle && `Decoded: ${lead.decodedVehicle}`,
    lead.insurance && `Insurance: ${lead.insurance}`,
    lead.carrier && `Carrier: ${lead.carrier}`,
    lead.postalCode && `ZIP: ${lead.postalCode}`,
    // Normalised for reading: an alert is scanned on a phone in seconds and
    // +15035550100 is harder to take in than (503) 555-0100.
    lead.phone && `Phone: ${formatPhoneDisplay(lead.phone) || lead.phone}`,
    lead.email && `Email: ${lead.email}`,
    lead.message && `Notes: ${lead.message}`,
    lead.source && `Source: ${lead.source}`,
    // The HTML alert renders this as a badge instead — see emailHtml — so it
    // is filtered out of the table there. It stays here for the plain-text
    // part, which has no badges and is what a forwarded copy carries.
    (() => {
      const ad = adSourceOf(lead.attribution)
      return ad && `Ad click: ${ad.network}${ad.campaign ? ` — ${ad.campaign}` : ''}`
    })(),
    lead.landingPage && `Page: ${lead.landingPage}`,
    lead.damagePhotoUrl && `Photo: ${lead.damagePhotoUrl}`,
  ].filter(Boolean) as string[]
}

/**
 * The SMS body: everything useful that fits in ONE billed segment.
 *
 * Two things decide the cost, and only one of them is length.
 *
 * A message containing a single character outside the GSM-7 alphabet is sent
 * as UCS-2, where a segment holds 70 characters instead of 160. This body used
 * to open "New lead — {shop}" and join the job to the vehicle with "·", so
 * EVERY alert this platform has ever sent was billed as two segments where one
 * would have done — while the comment here claimed it was kept to one. Both
 * characters are gone, and `fitSegments` normalises whatever a shop name or a
 * customer's own words drag in.
 *
 * The order is the priority order, and the tail is dropped rather than the
 * message being allowed to grow. Name and number first, because the only
 * useful action on a lead alert is to call it and a dispatcher reading a lock
 * screen should not have to open anything; then what the job is; then the ZIP,
 * which decides whether a mobile van can take it.
 */
function smsBody(businessName: string, lead: LeadSummary): string {
  return fitSegments(
    [
      // FORMATTED, not E.164. The number arrives as +15037416823 and that is
      // what the alert used to read — a wall of digits somebody has to parse
      // before they can dial it, on the one line the whole message exists
      // for. The two extra characters are free in every sense that matters
      // here: parentheses, the hyphen and the space are all GSM-7 basic, so
      // the encoding does not change, and fitSegments still guarantees the
      // one segment.
      `${lead.name || 'New lead'} ${formatPhoneDisplay(lead.phone) || lead.phone || ''}`.trim(),
      [lead.service, lead.vehicle].filter(Boolean).join(', '),
      lead.postalCode ? `ZIP ${lead.postalCode}` : '',
      businessName,
    ],
    1
  )
}

/**
 * The landing page as a person reads it: host and path, no query string.
 *
 * WHY THIS EXISTS. The full URL carries the ad click — gclid, gbraid,
 * campaignid, gad_source — which makes it a couple of hundred characters with
 * nowhere to break. A table cell holding a string that cannot wrap is a table
 * as wide as that string, and iOS Mail renders the table at its natural width
 * and then scales it down to fit the screen. So one invisible value decided
 * the type size of every field in the alert: the job, the vehicle, the ZIP
 * and the phone number all rendered at about half size while the name and the
 * buttons around them were fine.
 *
 * Nobody reading a lead alert needs the click id. It is stored on the lead and
 * uploaded to Google from there, and the plain-text part of this same email
 * still carries the URL in full for anyone debugging attribution.
 */
function readablePage(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.host}${path}`
  } catch {
    // Not a URL we can parse — drop the query string by hand rather than
    // handing the table the whole thing back.
    return url.split('?')[0]
  }
}

/**
 * Exported ONLY so it can be looked at without sending one.
 *
 * scripts/preview-lead-email.ts renders it at phone width. There was no way
 * to see this email except by mailing a real alert to a real inbox, which is
 * how it went a year with a details table rendering at half size on the
 * device every one of them is read on.
 */
export function emailHtml(businessName: string, lead: LeadSummary): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const rows = plainLines(lead)
    // The photo is rendered as an image below, so a row repeating its URL
    // would just be a long unreadable string in the middle of the details.
    .filter((line) => !line.startsWith('Photo: ') && !line.startsWith('Ad click: '))
    .map((line) => {
      const [label, ...rest] = line.split(': ')
      const raw = rest.join(': ')
      const value = label === 'Page' ? readablePage(raw) : raw
      // break-word on the value, and a fixed layout on the table below: one
      // long value must never be allowed to set the width of the alert again.
      return `<tr><td class="gl-label" style="padding:7px 14px 7px 0;color:#6b7280;width:92px;vertical-align:top">${esc(label)}</td><td style="padding:7px 0;color:#111827;word-break:break-word;overflow-wrap:anywhere">${esc(value)}</td></tr>`
    })
    .join('')
  const ad = adSourceOf(lead.attribution)
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
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
/* THE PHONE GETS ITS WIDTH BACK.
   The inline padding below is the desktop shape and the fallback for any
   client that strips this block; on a 390px screen it spent 96px — a quarter
   of the screen — on two nested margins, and the details were reading in a
   column barely wide enough for "Not sure yet about insurance". The card is
   centred at 520px on a desktop either way, so the margin only ever mattered
   here. !important because the inline styles it overrides cannot be removed:
   a client that ignores this block has to keep working. */
@media only screen and (max-width:480px) {
  .gl-wrap { padding: 8px !important; }
  .gl-card { padding: 16px !important; }
  .gl-label { width: 84px !important; padding-right: 10px !important; }
}
</style></head><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div class="gl-wrap" style="max-width:520px;margin:0 auto;padding:20px">
  <div class="gl-card" style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${lead.isCall ? 'Incoming phone call' : 'New lead'}</p>
    <h1 style="margin:0 0 4px;font-size:22px;color:#111827">${esc(lead.name || (lead.isCall ? 'Incoming phone call' : 'New inquiry'))}</h1>
    <p style="margin:0 0 ${ad ? '12' : '18'}px;color:#6b7280;font-size:14px">${esc(businessName)}${lead.isCall && lead.calledAtLabel ? ` &middot; called ${esc(lead.calledAtLabel)}` : ''}</p>
    ${
      /* THE ANSWER TO "ARE THE ADS WORKING", ON THE ALERT ITSELF. High enough
         to be read before the buttons, because it changes how the call is
         handled: this one was paid for. The campaign is named when the ad
         tagged itself; the badge stands alone when only the click id came
         through, which is the common case. */
      ad
        ? `<p style="margin:0 0 18px"><span style="display:inline-block;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:700">&#9679; From your ${esc(ad.network)}${ad.campaign ? ` &middot; ${esc(ad.campaign)}` : ''}</span></p>`
        : ''
    }
    ${tel ? `<a href="${esc(tel)}" style="display:block;text-align:center;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:16px">Call ${esc(formatPhoneDisplay(lead.phone) || lead.phone)}</a>` : ''}
    ${sms ? `<a href="${esc(sms)}" style="display:block;text-align:center;background:#fff;color:#1d4ed8;border:1.5px solid #1d4ed8;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;font-size:16px;margin-top:8px">Text ${esc(lead.name?.trim().split(/\s+/)[0] || 'them')}</a>` : ''}
    ${
      lead.damagePhotoUrl
        ? `<a href="${esc(lead.damagePhotoUrl)}" style="display:block;margin-top:18px;text-decoration:none"><img src="${esc(lead.damagePhotoUrl)}" alt="Photo of the damage" width="472" style="width:100%;max-width:472px;border-radius:10px;border:1px solid #e5e7eb;display:block"><span style="display:block;margin-top:6px;font-size:12px;color:#6b7280">Photo sent by the customer — tap to open full size</span></a>`
        : ''
    }
    ${
      lead.calibration
        ? `<p style="margin:18px 0 0;padding:11px 13px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;font-size:14px;color:#78350F"><strong>${esc(lead.calibration)}</strong> &mdash; quote the calibration, not just the glass.</p>`
        : ''
    }
    <!-- table-layout:fixed so the column widths come from this row and not
         from the longest value in the table; 15px because this is read on a
         phone, at arm's length, in a hurry. -->
    <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:15px;line-height:1.45;margin-top:18px">${rows}</table>
    ${
      lead.outcomeUrl
        ? `<div style="margin:20px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827">Did this one book?</p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280">One tap. It is what turns your leads list into a revenue figure — and it is how the ads learn which clicks are worth buying.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
        <td style="padding-right:5px;width:50%"><a href="${esc(lead.outcomeUrl)}" style="display:block;text-align:center;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:12px;border-radius:10px;font-size:15px">We booked it</a></td>
        <td style="padding-left:5px;width:50%"><a href="${esc(lead.outcomeUrl)}" style="display:block;text-align:center;background:#fff;color:#374151;border:1.5px solid #d1d5db;text-decoration:none;font-weight:700;padding:11px;border-radius:10px;font-size:15px">Didn't book</a></td>
      </tr></table>
    </div>`
        : ''
    }
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

  // ONLY THE ADDRESSES AND NUMBERS SET ON THIS CLIENT. There is deliberately
  // no fallback here — not the shop's own `Client.email`, not an operator
  // address from the environment, not a "last known good" from anywhere. A
  // lead alert carries a real customer's name, phone number and sometimes a
  // photo of their car, so a default recipient is a way for that to reach
  // somebody nobody chose. An unconfigured client sends nothing and says so on
  // its readiness badge, which is the correct failure.
  // A shop can turn OFF the email for inbound calls while keeping it for
  // forms. The phone ringing is not news to a shop whose phone is answered by
  // a person; a form submitted at 9pm is. SMS is deliberately not gated by
  // this — a text about a call is what surfaces the one nobody picked up.
  const emailThisOne = config.emailEnabled && !(lead.isCall && !config.emailCallLeads)
  const emails = emailThisOne ? config.emailTo.filter(Boolean) : []
  const numbers = config.smsEnabled ? config.smsTo.filter(Boolean) : []
  if (emails.length === 0 && numbers.length === 0) return result

  if (emails.length > 0) {
    const apiKey = await secret('RESEND_API_KEY')
    // The address comes from configuration; the display name is fixed. A shop
    // owner triages by sender, and "AUTO GLASS LEAD" in the sender column
    // reads as what it is before the subject is even glanced at.
    const configured = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    const address = /<([^>]+)>/.exec(configured)?.[1] || configured
    const from = `AUTO GLASS LEAD <${address}>`
    if (!apiKey) {
      result.errors.push('RESEND_API_KEY is not configured')
    } else {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)
        const sent = await resend.emails.send({
          from,
          to: emails,
          subject: `[NEW LEAD - ${businessName}] - Call Immediately`,
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
        // Logged because the cost of this is invisible otherwise: a change to
        // the body, or a shop name with an emoji in it, silently doubles every
        // alert that shop sends and nothing in the app would say so.
        const segments = countSegments(body)
        if (segments > 1) {
          console.warn(
            `[Notify] SMS for ${businessName} is ${segments} segments — each recipient is billed ${segments}x`
          )
        }
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
