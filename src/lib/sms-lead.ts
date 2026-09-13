import { prisma } from '@/lib/db'
import { findSameDayDuplicateCanonical, earliestSameDayContact } from '@/lib/lead-dedup'
import { notifyNewLead as notifyLeadRecipients } from '@/lib/lead-notifications'
import { notifyNewLead as notifyAdminPush } from '@/lib/push-notifications'
import { outcomeUrlFor } from '@/lib/lead-outcome-token'
import { isRenderableImage } from '@/lib/twilio-sms'
import type { TrackingNumber } from '@prisma/client'

/**
 * Turning a text into a lead, or onto the lead that already exists.
 *
 * THE ATTACHMENT IS THE WHOLE POINT, and it is what makes this different from
 * `call-lead.ts`. The common case is not a stranger texting out of nowhere: it
 * is somebody who filled in the quote form thirty seconds ago — carrying a
 * gclid, a vehicle, a postcode — and then sent the photo the confirmation
 * asked for. A new lead row for that photo would split one enquiry in two,
 * count it twice, and leave the photo on the row with no attribution while
 * the ad click sat on the row with no photo.
 *
 * So an inbound text looks for the same-day canonical lead for that number
 * first (`lead-dedup.ts`, the same rule the form and the calls use) and
 * attaches to it. Only a number nobody has heard from today gets a new row.
 *
 * THE MessageSid IS THE RETRY GUARD. Twilio replays a webhook it thinks
 * failed, so the message is written keyed on the Sid and a replay is a no-op
 * — the same job `twilioCallSid` does for calls. Without it a slow response
 * becomes a second photo and a second alert.
 */

export interface SmsFacts {
  messageSid: string
  /** The customer, E.164. */
  from: string
  /** The tracking number they texted, E.164. */
  to: string
  body: string
  /** Our own Blob copies, already stored. */
  mediaUrls: string[]
  /** Content types as Twilio reported them, index-matched to mediaUrls. */
  mediaTypes: string[]
  /** The whole webhook body, for when a reader here turns out to be wrong. */
  raw?: Record<string, string>
}

export interface SmsResult {
  leadId: string
  /** False when the Sid was already recorded — a Twilio retry. */
  stored: boolean
  /** True when this text created the lead rather than joining one. */
  createdLead: boolean
  alerted: boolean
}

/** A one-line summary of the text, for the alert subject and the lead's name. */
function describe(facts: SmsFacts): string {
  const photos = facts.mediaUrls.length
  if (!photos) return 'Text message'
  if (photos === 1) return 'Text with a photo'
  return `Text with ${photos} photos`
}

export async function recordInboundSms(
  number: TrackingNumber & {
    client: { id: string; slug: string; businessName: string; timezone: string }
  },
  facts: SmsFacts
): Promise<SmsResult> {
  // THE RETRY GUARD, first. Everything below — the lead, the alert — has
  // already happened if this Sid is on file.
  const already = await prisma.leadMessage
    .findUnique({ where: { twilioSid: facts.messageSid }, select: { leadId: true } })
    .catch(() => null)
  if (already) {
    console.log(`[Twilio SMS] ${facts.messageSid} already recorded — Twilio retry, ignoring`)
    return { leadId: already.leadId, stored: false, createdLead: false, alerted: false }
  }

  /* ATTACH, DO NOT DUPLICATE. The same-day canonical for this number is
     almost always the form submission the photo belongs to. */
  const canonical = await findSameDayDuplicateCanonical({
    clientId: number.clientId,
    phone: facts.from,
    timezone: number.client.timezone,
  }).catch(() => null)

  let leadId: string
  let createdLead = false

  if (canonical) {
    leadId = canonical.id
  } else {
    const lead = await prisma.lead.create({
      data: {
        clientId: number.clientId,
        phone: facts.from,
        source: 'SMS',
        status: 'NEW',
        trackingNumber: facts.to,
        formName: number.label ? `Text — ${number.label}` : 'Text',
      },
    })
    leadId = lead.id
    createdLead = true
  }

  /* THE UNIQUE INDEX IS THE REAL GUARANTEE, not the check above. Twilio
     retries by firing a second request, and two identical webhooks arriving
     together both pass a findUnique before either has written — the same race
     lead-dedup.ts settles by computing after the insert. So a duplicate-key
     failure here is not an error, it is the other copy winning: the message
     is stored exactly once and this one reports itself as a retry.

     Found by reading the log of a real retry, which raced the original. */
  try {
    await prisma.leadMessage.create({
      data: {
        clientId: number.clientId,
        leadId,
        direction: 'inbound',
        body: facts.body || null,
        mediaUrls: facts.mediaUrls,
        twilioSid: facts.messageSid,
        fromNumber: facts.from,
        toNumber: facts.to,
        raw: facts.raw ?? undefined,
      },
    })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === 'P2002') {
      console.log(`[Twilio SMS] ${facts.messageSid} raced its own retry — stored once, not twice`)
      return { leadId, stored: false, createdLead: false, alerted: false }
    }
    throw error
  }

  /* THE PHOTO GOES ONTO THE LEAD TOO, in formData, because that is where
     every existing reader already looks for one: the alert email renders
     `damagePhotoUrl` inline, and the admin and portal lead views read the
     form's own `damage_photo_url`. A texted photo that only lived in the
     message table would be invisible to all three, which is the outcome this
     whole feature exists to end. Only ever FILLS IN — a photo the customer
     attached to the form is the one they chose first, and a later text must
     not overwrite it. */
  const firstImage = facts.mediaUrls.find((_, i) => isRenderableImage(facts.mediaTypes[i] || ''))
  if (firstImage) {
    const lead = await prisma.lead
      .findUnique({ where: { id: leadId }, select: { formData: true } })
      .catch(() => null)
    const data = (lead?.formData && typeof lead.formData === 'object' ? lead.formData : {}) as Record<
      string,
      unknown
    >
    if (!data.damage_photo_url) {
      await prisma.lead
        .update({
          where: { id: leadId },
          data: { formData: { ...data, damage_photo_url: firstImage } },
        })
        .catch((error) => console.error('[Twilio SMS] Could not attach photo to lead:', error))
    }
  }

  /* THE ALERT. Urgent, always: unlike an answered call there is nobody at the
     other end of this yet — somebody has sent a photo and is waiting for a
     price. It is also the channel the site told them was fastest.

     Suppressed only when this number has already been alerted today, by the
     same rule the calls use: a photo arriving thirty seconds after the form
     submission is one enquiry, and the shop has the email already. The
     MESSAGE is still stored and still shows on the lead — what is skipped is
     the second interruption. */
  let alerted = false
  try {
    const earliest = await earliestSameDayContact({
      clientId: number.clientId,
      leadId,
      phone: facts.from,
      timezone: number.client.timezone,
    })
    if (earliest.isEarliest) {
      const sentAtLabel = (() => {
        try {
          return new Intl.DateTimeFormat('en-US', {
            timeZone: number.client.timezone || 'America/Denver',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(new Date())
        } catch {
          return undefined
        }
      })()

      await notifyLeadRecipients(
        number.clientId,
        number.client.businessName,
        {
          name: describe(facts),
          phone: facts.from,
          email: '',
          service: '',
          vehicle: '',
          postalCode: '',
          message: facts.body
            ? `They texted: “${facts.body}”`
            : 'They sent a photo with no message. Reply to the number above.',
          source: number.label ? `Text — ${number.label} line` : 'Text — tracking number',
          isCall: true,
          calledAtLabel: sentAtLabel,
          ...(firstImage ? { damagePhotoUrl: firstImage } : {}),
          leadUrl: `${process.env.APP_URL || 'https://glassleads.app'}/admin/leads/${leadId}`,
          outcomeUrl: outcomeUrlFor(leadId),
        },
        { kind: 'urgent' }
      )
      notifyAdminPush(number.clientId, {
        firstName: describe(facts),
        phone: facts.from,
        source: 'SMS',
      }).catch(() => {})
      alerted = true
    } else {
      console.log(
        `[Twilio SMS] ${facts.messageSid} stored on lead ${leadId} without a second alert — already heard from ${facts.from} today`
      )
    }
  } catch (error) {
    // A stored message without an alert is recoverable; a webhook that throws
    // gets retried by Twilio and the Sid guard above makes that harmless.
    console.error('[Twilio SMS] Alert failed:', error)
  }

  return { leadId, stored: true, createdLead, alerted }
}
