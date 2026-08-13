import { prisma } from '@/lib/db'
import { twilioParams, verifyTwilioSignature, publicUrl, twiml } from '@/lib/twilio-voice'
import { recordCall, isMissedCall } from '@/lib/call-lead'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/twilio/status
 *
 * The `action` on the <Dial>: fires when the forwarding leg ends, however it
 * ended. This is where a call becomes a lead, because it is the first moment
 * we know whether anyone picked up — and an unanswered call is the one worth
 * waking somebody for.
 *
 * The caller may still be on the line when this runs. Returning empty TwiML
 * hangs up, which is what we want: the conversation is over, and anything
 * else would leave them listening to silence.
 */
export async function POST(request: Request) {
  const url = publicUrl(request)
  const params = await twilioParams(request)

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio Status] Rejected unsigned request: ${check.reason}`)
    return new Response('Forbidden', { status: 403 })
  }

  const callSid = params.CallSid || ''
  const to = params.To || ''
  const from = params.From || ''
  const dialStatus = params.DialCallStatus || null
  const duration = params.DialCallDuration ? parseInt(params.DialCallDuration, 10) : null

  try {
    const number = await prisma.trackingNumber.findUnique({
      where: { phoneNumber: to },
      include: {
        client: { select: { id: true, slug: true, businessName: true, timezone: true } },
      },
    })
    if (!number) {
      console.error(`[Twilio Status] No tracking number for ${to} (call ${callSid})`)
      return twiml('')
    }

    const leadId = await recordCall(number, {
      callSid,
      from,
      to,
      status: dialStatus,
      durationSeconds: Number.isFinite(duration) ? duration : null,
    })

    console.log(
      `[Twilio Status] ${callSid} ${dialStatus} (${duration ?? '?'}s) → lead ${leadId}${
        isMissedCall(dialStatus) ? ' — MISSED' : ''
      }`
    )
  } catch (error) {
    // Never 500. Twilio retries a failed callback, and a retry would run this
    // again against a row that may now exist — the CallSid guard handles that,
    // but the caller does not benefit from us being noisy about it.
    console.error('[Twilio Status] Failed:', error)
  }

  return twiml('')
}
