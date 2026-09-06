import { prisma } from '@/lib/db'
import { earliestSameDayContact } from '@/lib/lead-dedup'
import { notifyNewLead as notifyLeadRecipients } from '@/lib/lead-notifications'
import { notifyNewLead as notifyAdminPush } from '@/lib/push-notifications'
import { outcomeUrlFor } from '@/lib/lead-outcome-token'
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
 * A call the shop did not pick up needs somebody to act NOW. One they
 * answered is a record: they already had the conversation, and the alert
 * exists so the number is in their inbox when they want to ring back.
 *
 * Both are worth an email; only the missed one is worth an interruption. See
 * the alert block below for how that difference is expressed.
 */
export function isMissedCall(status: string | null | undefined): boolean {
  if (!status) return false
  return ['no-answer', 'busy', 'failed', 'canceled'].includes(status)
}

function sourceLabel(number: TrackingNumber, missed: boolean): string {
  const line = number.label ? `${number.label} line` : 'tracking number'
  return missed ? `Missed call — ${line}` : `Call — ${line}`
}

/** "1m 37s" — the length of the conversation, for the record email. */
function spokenFor(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return ''
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${mins}m ${rest}s` : `${mins}m`
}

/**
 * Create or update the Lead for a call. Returns the lead id.
 *
 * THE ROW IS CREATED WHEN THE CALL ARRIVES, not when it ends. It used to be
 * written only by the status callback — the one that fires when the dial leg
 * finishes — which made that callback a single point of failure for the
 * existence of the lead. If it never arrived, or arrived unsigned, the call
 * had happened, the shop had spoken to the customer, and nothing anywhere
 * recorded it. That is not theoretical: a 97-second answered ad call went
 * missing that way, and the only reason anybody noticed was somebody
 * comparing Google's call column against the leads list by hand.
 *
 * THE ALERT FOLLOWS THE OUTCOME, NOT THE CREATION. Because the row now
 * usually exists before the outcome is known, "did we just learn how this
 * call ended" is the thing to alert on — the transition from no callStatus to
 * one — rather than "did we just create a row". Both paths still work if the
 * status callback is the first to arrive.
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

  let leadId: string
  /**
   * Did THIS call teach us how the call ended? The alert hangs off that
   * rather than off creating the row, so it fires exactly once whichever
   * webhook happens to arrive first — and still fires when the row was
   * created a minute earlier by the call simply starting.
   */
  let outcomeJustLanded = false

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
    leadId = existing.id
    outcomeJustLanded = !existing.callStatus && !!facts.status
  } else {
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
    leadId = lead.id
    outcomeJustLanded = !!facts.status
  }

  /**
   * BOTH OUTCOMES GET AN EMAIL, AND THEY READ DIFFERENTLY.
   *
   * Missed: somebody has to ring back, and the alert says so. Answered: the
   * shop already had the conversation, so the alert is the record of it —
   * the number, the time, how long they spoke — sitting in the inbox for
   * when they need to call back or look the job up. A shop that only ever
   * hears about the calls it failed to answer has no record of the ones it
   * did, which is most of them.
   *
   * ONLY THE MISSED ONE INTERRUPTS. The SMS is the channel that buzzes a
   * pocket and is billed per segment; a call that was answered needs neither.
   * That is a difference in urgency, not in whether the shop is told.
   *
   * Wrapped whole: a lead that exists without an alert is recoverable, and a
   * webhook that throws gets retried by Twilio.
   */
  if (outcomeJustLanded) {
    try {
      const earliest = await earliestSameDayContact({
        clientId: number.clientId,
        leadId,
        phone: facts.from,
        timezone: number.client.timezone,
      })
      const spoken = spokenFor(facts.durationSeconds)
      const calledAtLabel = (() => {
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

      if (earliest.isEarliest) {
        await notifyLeadRecipients(
          number.clientId,
          number.client.businessName,
          {
            name: missed ? 'Missed call' : 'Answered call',
            phone: facts.from,
            email: '',
            service: '',
            vehicle: '',
            postalCode: '',
            message: missed
              ? 'Nobody picked up. The caller has not left any details — calling straight back is the whole opportunity.'
              : `Somebody answered${spoken ? ` and spoke for ${spoken}` : ''}. Nothing to do — this is your record of the call, with the number to hand if you need to ring them back.`,
            source: sourceLabel(number, missed),
            isCall: true,
            calledAtLabel,
            leadUrl: `${process.env.APP_URL || 'https://glassleads.app'}/admin/leads/${leadId}`,
            outcomeUrl: outcomeUrlFor(leadId),
          },
          // An answered call is a note for the record, not an interruption.
          { kind: missed ? 'urgent' : 'record' }
        )
        if (missed) {
          notifyAdminPush(number.clientId, {
            firstName: 'Missed call',
            phone: facts.from,
            source: 'PHONE',
          }).catch(() => {})
        }
      } else {
        console.log(
          `[Twilio] ${missed ? 'Missed' : 'Answered'} call ${facts.callSid} not alerted — already heard from ${facts.from} today`
        )
      }
    } catch (error) {
      console.error('[Twilio] Call alert failed:', error)
    }
  }

  return leadId
}
