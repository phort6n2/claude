import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { twilioCreds } from '@/lib/twilio-voice'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/twilio/numbers
 *
 * Every number in the connected Twilio account, and — the part that matters —
 * where each one currently sends its calls.
 *
 * This exists because "are my numbers usable here?" is not a question worth
 * answering from documentation. A number bought inside HighLevel's own phone
 * system lives in a Twilio subaccount they control, and will simply not appear
 * in this list. A number in your own account will appear, with a Voice URL
 * pointing at whatever is handling it today. Both facts are one API call away,
 * and guessing at them is how someone repoints a live number by mistake.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const creds = await twilioCreds()
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No Twilio credentials saved. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN under Settings → API keys.',
      },
      { status: 400 }
    )
  }

  try {
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PageSize=100`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (res.status === 401) {
      return NextResponse.json(
        { ok: false, error: 'Twilio rejected the credentials.' },
        { status: 400 }
      )
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Twilio returned HTTP ${res.status}.` },
        { status: 400 }
      )
    }

    const data = await res.json()
    const raw: Array<Record<string, unknown>> = data.incoming_phone_numbers || []

    // What this app already knows about, so a number can be shown as claimed
    // rather than looking free when it is already routing somewhere.
    const claimed = await prisma.trackingNumber
      .findMany({
        select: {
          phoneNumber: true,
          active: true,
          client: { select: { id: true, businessName: true } },
        },
      })
      .catch(() => [])
    const claimedBy = new Map(claimed.map((c) => [c.phoneNumber, c]))

    const base = process.env.APP_URL || 'https://glassleads.app'
    const ourVoiceUrl = `${base}/api/webhooks/twilio/voice`

    const numbers = raw.map((n) => {
      const phoneNumber = String(n.phone_number || '')
      const voiceUrl = String(n.voice_url || '')
      const mine = claimedBy.get(phoneNumber)
      return {
        phoneNumber,
        friendlyName: String(n.friendly_name || ''),
        sid: String(n.sid || ''),
        voiceUrl,
        smsUrl: String(n.sms_url || ''),
        capabilities: n.capabilities ?? null,
        /* Points here already — safe to use, nothing to move. */
        pointsHere: voiceUrl.startsWith(ourVoiceUrl),
        /* Pointing somewhere else that is not empty: repointing it will take
         * it away from whatever that is. This is the one to read carefully. */
        pointsElsewhere: !!voiceUrl && !voiceUrl.startsWith(ourVoiceUrl),
        claimedByClient: mine ? { ...mine.client, active: mine.active } : null,
      }
    })

    return NextResponse.json({
      ok: true,
      accountSid: creds.accountSid,
      ourVoiceUrl,
      count: numbers.length,
      numbers,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    )
  }
}
