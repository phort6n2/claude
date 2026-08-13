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
 * POST /api/webhooks/twilio/whisper?number=<trackingNumberId>
 *
 * Played to the SHOP when they pick up, before the customer is connected. The
 * customer hears none of it.
 *
 * This is what makes a tracking number usable in a busy shop. Forwarding
 * passes the customer's caller ID through — which is what you want for
 * calling back — but it means an incoming ad call is indistinguishable from a
 * supplier or a mate. Two seconds of "Google Ads call" changes how it gets
 * answered.
 */
export async function POST(request: Request) {
  const url = publicUrl(request)
  const params = await twilioParams(request)

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio Whisper] Rejected unsigned request: ${check.reason}`)
    return new Response('Forbidden', { status: 403 })
  }

  const id = new URL(url).searchParams.get('number')
  if (!id) return twiml('')

  const number = await prisma.trackingNumber
    .findUnique({ where: { id }, select: { whisper: true } })
    .catch(() => null)

  const message = number?.whisper?.trim()
  // No message means connect them straight through. Silence here is correct —
  // anything else would be a noise the shop did not ask for on every call.
  if (!message) return twiml('')

  return twiml(`<Say voice="alice">${xmlEscape(message)}</Say>`)
}
