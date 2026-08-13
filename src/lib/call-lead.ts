import { prisma } from '@/lib/db'
import { earliestSameDayContact } from '@/lib/lead-dedup'
import { notifyNewLead as notifyLeadRecipients } from '@/lib/lead-notifications'
import { notifyNewLead as notifyAdminPush } from '@/lib/push-notifications'
import type { TrackingNumber } from '@prisma/client'

/**
 * Turning a tracked phone call into a lead.
 *
 * Two webhooks describe one call — the dial finishing, and the recording
 * arriving a minute or two later — and either can reach us first if Twilio
 * retries. Both call in here, and the CallSid decides whether this is a new
 * lead or more detail about one that already exists. Nothing here is allowed
 * to create a second row for the same call.
 */

export interface CallFacts {
  callSid: string
  /** The customer, E.164. */
  from: string
  /** The tracking number they dialled, E.164. */
  to: string
  /** completed | no-answer | busy | failed | canceled */
  status?: string | null
  durationSeconds?: number | null
  recordingUrl?: string | null
}

/**
 * A call the shop did not pick up is a lead they need to know about NOW; a
 * call they answered is one they already had. Alerting on both trains people
 * to ignore the alerts, and the missed one is the only one where a
 * notification changes the outcome.
 */
export function isMissedCall(status: string | null | undefined): boolean {
  if (!status) return false
  return ['no-answer', 'busy', 'failed', 'canceled'].includes(status)
}

function sourceLabel(number: TrackingNumber, missed: boolean): string {
  const line = number.label ? `${number.label} line` : 'tracking number'
  return missed ? `Missed call — ${line}` : `Call — ${line}`
}

/**
 * Create or update the Lead for a call. Returns the lead id.
 *
 * Alerts fire only on the transition into "missed", and only once: the same
 * earliest-of-the-day rule the form webhook uses, so a customer who filled the
 * form this morning and rings this afternoon does not generate a second alarm.
 */
export async function recordCall(
  number: TrackingNumber & { client: { id: string; slug: string; businessName: string; timezone: string } },
  facts: CallFacts
): Promise<string> {
  const missed = isMissedCall(facts.status)

  const existing = await prisma.lead.findUnique({
    where: { twilioCallSid: facts.callSid },
    select: { id: true, callStatus: true },
  })

  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        // Only ever fill in — a later webhook carrying less than an earlier
        // one must not erase what we already know about the call.
        ...(facts.status ? { callStatus: facts.status } : {}),
        ...(facts.durationSeconds != null ? { callDurationSecs: facts.durationSeconds } : {}),
        ...(facts.recordingUrl ? { callRecordingUrl: facts.recordingUrl } : {}),
      },
    })
    return existing.id
  }

  const lead = await prisma.lead.create({
    data: {
      clientId: number.clientId,
      phone: facts.from,
      source: 'PHONE',
      status: 'NEW',
      twilioCallSid: facts.callSid,
      trackingNumber: facts.to,
      callStatus: facts.status ?? null,
      callDurationSecs: facts.durationSeconds ?? null,
      callRecordingUrl: facts.recordingUrl ?? null,
      formName: number.label ? `Call — ${number.label}` : 'Call',
    },
  })

  // Alerts only for calls that went unanswered. Wrapped whole: a lead that
  // exists without an alert is recoverable, a webhook that throws is retried
  // by Twilio and would create nothing at all on the second attempt either.
  if (missed) {
    try {
      const earliest = await earliestSameDayContact({
        clientId: number.clientId,
        leadId: lead.id,
        phone: facts.from,
        timezone: number.client.timezone,
      })
      if (earliest.isEarliest) {
        await notifyLeadRecipients(number.clientId, number.client.businessName, {
          name: 'Missed call',
          phone: facts.from,
          email: '',
          service: '',
          vehicle: '',
          postalCode: '',
          message: 'Nobody picked up. The caller has not left any details — calling straight back is the whole opportunity.',
          source: sourceLabel(number, true),
          leadUrl: `${process.env.APP_URL || 'https://glassleads.app'}/admin/leads/${lead.id}`,
        })
        notifyAdminPush(number.clientId, {
          firstName: 'Missed call',
          phone: facts.from,
          source: 'PHONE',
        }).catch(() => {})
      } else {
        console.log(
          `[Twilio] Missed call ${facts.callSid} not alerted — already heard from ${facts.from} today`
        )
      }
    } catch (error) {
      console.error('[Twilio] Missed-call alert failed:', error)
    }
  }

  return lead.id
}
