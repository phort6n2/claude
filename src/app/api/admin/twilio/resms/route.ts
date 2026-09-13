import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import { twilioCreds } from '@/lib/twilio-voice'
import { appOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — point every tracking number's SmsUrl at this app.
 *
 * WHY A BACKFILL. Numbers are bought with their webhooks set in the purchase
 * request, so a number bought from today is already right. Every number
 * bought BEFORE the SMS webhook existed has a VoiceUrl and no SmsUrl — and a
 * number with no SmsUrl has no instruction for a message, so Twilio swallows
 * it silently. The hosted sites have been telling customers to text a photo
 * of the damage the whole time.
 *
 * Reads Twilio to find each number's SID rather than trusting the one on
 * file: `twilioSid` is null on any number added by hand, and a number is
 * identified by the number itself in any case.
 *
 * `?dryRun=1` reports what each number currently points at and changes
 * nothing — worth running first, because this rewrites the VoiceUrl too and
 * an unexpected value there is the interesting finding. The Maintenance
 * runner sends no body, which is why the flag is read from the query string
 * as well.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const dryRun =
    new URL(request.url).searchParams.get('dryRun') === '1' || body?.dryRun === true

  const creds = await twilioCreds()
  if (!creds) {
    return NextResponse.json({ error: 'No Twilio credentials saved.' }, { status: 400 })
  }

  const numbers = await prisma.trackingNumber.findMany({
    where: { active: true },
    select: {
      phoneNumber: true,
      label: true,
      client: { select: { businessName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const base = appOrigin()
  const voiceUrl = `${base}/api/webhooks/twilio/voice`
  const smsUrl = `${base}/api/webhooks/twilio/sms`
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  const results: Array<Record<string, unknown>> = []

  for (const number of numbers) {
    const row: Record<string, unknown> = {
      client: number.client.businessName,
      number: number.phoneNumber,
      ...(number.label ? { label: number.label } : {}),
    }
    try {
      const lookup = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number.phoneNumber)}`,
        { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
      )
      const found = (await lookup.json().catch(() => ({}))) as {
        incoming_phone_numbers?: Array<{ sid: string; sms_url?: string; voice_url?: string }>
      }
      const entry = found.incoming_phone_numbers?.[0]
      if (!entry?.sid) {
        // On file here, not in the Twilio account. Named rather than skipped:
        // it means the number was released and the row is stale, and any call
        // or text to it is going nowhere.
        row.error = 'not found in the Twilio account'
        results.push(row)
        continue
      }

      row.smsUrlWas = entry.sms_url || '(none)'
      row.alreadyCorrect = entry.sms_url === smsUrl
      if (entry.voice_url && entry.voice_url !== voiceUrl) row.voiceUrlWas = entry.voice_url

      if (dryRun) {
        row.changed = false
        row.note = entry.sms_url === smsUrl ? 'already set' : 'would set SmsUrl'
        results.push(row)
        continue
      }
      if (entry.sms_url === smsUrl) {
        row.changed = false
        row.note = 'already set'
        results.push(row)
        continue
      }

      const update = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers/${entry.sid}.json`,
        {
          method: 'POST',
          headers,
          body: new URLSearchParams({
            SmsUrl: smsUrl,
            SmsMethod: 'POST',
            // Set together, so a number can never end up half-configured.
            VoiceUrl: voiceUrl,
            VoiceMethod: 'POST',
          }),
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (!update.ok) {
        const detail = await update.text().catch(() => '')
        row.changed = false
        row.error = `Twilio refused the update (HTTP ${update.status}). ${detail.slice(0, 160)}`
        results.push(row)
        continue
      }
      row.changed = true
      row.note = 'SmsUrl set'
    } catch (error) {
      row.changed = false
      row.error = error instanceof Error ? error.message : String(error)
    }
    results.push(row)
  }

  return NextResponse.json({
    dryRun,
    smsUrl,
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    alreadyCorrect: results.filter((r) => r.alreadyCorrect).length,
    failed: results.filter((r) => r.error).length,
    results,
  })
}
