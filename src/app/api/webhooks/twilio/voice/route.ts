import { prisma } from '@/lib/db'
import {
  twilioParams,
  verifyTwilioSignature,
  publicUrl,
  twiml,
  xmlEscape,
} from '@/lib/twilio-voice'

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

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio Voice] Rejected unsigned request: ${check.reason}`)
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
        client: { select: { id: true, slug: true, businessName: true, status: true } },
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

  const parts: string[] = []

  if (number.recordCalls && number.announceRecording) {
    parts.push(
      `<Say voice="alice">This call may be recorded for quality and training purposes.</Say>`
    )
  }

  const dialAttrs = [
    `callerId="${xmlEscape(callerId)}"`,
    `timeout="25"`,
    // The caller hears the shop's phone actually ringing, and the call is not
    // billed or marked answered until someone picks up. Without this Twilio
    // answers immediately and the customer hears a beat of nothing, which on a
    // mobile reads as a dropped call.
    `answerOnBridge="true"`,
    `action="${xmlEscape(statusUrl)}"`,
    `method="POST"`,
  ]
  if (number.recordCalls) {
    // Dual-channel: the caller and the shop end up on separate channels, which
    // is what makes the coaching transcript able to tell who said what.
    dialAttrs.push(`record="record-from-answering-dual"`)
    dialAttrs.push(`recordingStatusCallback="${xmlEscape(recordingUrl)}"`)
    dialAttrs.push(`recordingStatusCallbackEvent="completed"`)
    dialAttrs.push(`recordingStatusCallbackMethod="POST"`)
  }

  const numberAttrs = number.whisper?.trim()
    ? ` url="${xmlEscape(whisperUrl)}" method="POST"`
    : ''

  parts.push(
    `<Dial ${dialAttrs.join(' ')}><Number${numberAttrs}>${xmlEscape(number.forwardTo)}</Number></Dial>`
  )

  console.log(
    `[Twilio Voice] ${from} → ${to} (${number.client.businessName}) forwarding to ${number.forwardTo}`
  )

  return twiml(parts.join(''))
}
