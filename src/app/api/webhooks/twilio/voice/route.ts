import { prisma } from '@/lib/db'
import {
  twilioParams,
  verifyTwilioSignature,
  publicUrl,
  twiml,
  dialTwiml,
} from '@/lib/twilio-voice'
import { recordCall } from '@/lib/call-lead'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/twilio/voice
 *
 * A customer has dialled a tracking number. Twilio is asking what to do, and
 * is holding the call open until we answer — so everything here is on the
 * critical path of a ringing phone. Two database reads, no alerts, no
 * analysis; all of that hangs off the callbacks after the call.
 *
 * Whatever goes wrong, the caller must still reach the shop. Every failure
 * below still returns TwiML, and the one case where it cannot — an unknown
 * number, where there is nowhere to forward to — says so out loud rather than
 * dropping the call into silence.
 */
export async function POST(request: Request) {
  const url = publicUrl(request)
  const params = await twilioParams(request)

  /* WHICH NUMBER, BEFORE ANYTHING CAN GO WRONG.
     When the signature check threw, every call 500'd here and the log said
     only that it threw — so there was no way to tell WHOSE calls were being
     dropped, and "which clients lost calls" could not be answered at all.
     The dialled number is ours, not the caller's, so it is safe to log; the
     caller's number is deliberately not. Shape-checked because this is
     unverified input at this point and a log line is not a place to paste
     whatever somebody posted. */
  const dialled = /^\+\d{8,20}$/.test(params.To || '') ? params.To : '(malformed To)'

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio Voice] Rejected request for ${dialled}: ${check.reason}`)
    // 403 with no TwiML. An unverified caller gets nothing to work with.
    return new Response('Forbidden', { status: 403 })
  }

  const to = params.To || ''
  const from = params.From || ''
  const callSid = params.CallSid || ''

  const number = await prisma.trackingNumber
    .findUnique({
      where: { phoneNumber: to },
      include: {
        // timezone for recordCall's alert, which formats the call time in the
        // shop's own zone rather than the server's.
        client: {
          select: { id: true, slug: true, businessName: true, status: true, timezone: true },
        },
      },
    })
    .catch((err) => {
      console.error('[Twilio Voice] Lookup failed:', err)
      return null
    })

  if (!number || !number.active) {
    console.error(`[Twilio Voice] No active tracking number for ${to} (call ${callSid})`)
    return twiml(
      `<Say voice="alice">Sorry, this number is not in service. Please check the number and try again.</Say><Hangup/>`
    )
  }

  const base = new URL(url).origin
  const statusUrl = `${base}/api/webhooks/twilio/status`
  const recordingUrl = `${base}/api/webhooks/twilio/recording`
  const whisperUrl = `${base}/api/webhooks/twilio/whisper?number=${encodeURIComponent(number.id)}`

  // Blocked and withheld numbers arrive as "anonymous" or empty, which is not
  // a usable caller ID. Fall back to the tracking number so the shop's phone
  // still rings rather than Twilio rejecting the dial.
  const callerId = /^\+\d{8,}$/.test(from) ? from : number.phoneNumber

  /* WHAT THIS CALL IS ABOUT TO DO, in one line.
     Every one of these is a per-number toggle in the admin, and when the
     phone behaves differently from what the screen shows there is currently
     no way to tell which of the two is wrong. Saying what the row actually
     said settles that in one test call instead of an afternoon. */
  console.log(
    `[Twilio Voice] ${dialled} → ${number.client.businessName}: record=${number.recordCalls} announce=${number.announceRecording} whisper=${!!number.whisper?.trim()} forward=${number.forwardTo}`
  )

  // Built by a pure function in twilio-voice.ts so it can be asserted on
  // without a request — see the note on DIAL_RECORD_VALUES for why this
  // particular string is the one thing here nobody would ever catch by using
  // the app.
  const body = dialTwiml({
    callerId,
    forwardTo: number.forwardTo,
    record: number.recordCalls,
    announce: number.announceRecording,
    whisper: !!number.whisper?.trim(),
    statusUrl,
    recordingUrl,
    whisperUrl,
  })

  /**
   * WRITE THE LEAD NOW, not when the call ends.
   *
   * The row used to be created only by the status callback, which made that
   * one webhook the single point of failure for whether a call existed at
   * all. A 97-second answered call from an ad went missing exactly that way:
   * the customer got through, the shop had the conversation, and the leads
   * list had nothing — noticed only by somebody comparing Google's call
   * column against the app by hand.
   *
   * Idempotent on the CallSid, so the status callback still owns the outcome
   * and the alert; this only guarantees the call is on the record. Wrapped and
   * never awaited into the failure path: a database that is having a bad
   * minute must not stop the phone from ringing at the shop.
   */
  try {
    await recordCall(number, { callSid, from, to, status: null, durationSeconds: null })
  } catch (error) {
    console.error(`[Twilio Voice] Could not record call ${callSid}:`, error)
  }

  console.log(
    `[Twilio Voice] ${from} → ${to} (${number.client.businessName}) forwarding to ${number.forwardTo}`
  )

  return twiml(body)
}
