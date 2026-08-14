import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { toE164 } from '@/lib/contact-links'
import { twilioCreds } from '@/lib/twilio-voice'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Tracking numbers for one client.
 *
 * Adding a number does two things that have to succeed together: it records
 * the routing here, and it repoints the number at this app in Twilio. Doing
 * only the first leaves a number that looks configured and rings nowhere new;
 * doing only the second leaves calls arriving with nothing to match them to.
 * The Twilio update happens first, because that is the one that can fail for
 * reasons outside this app.
 */

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params

  try {
    const numbers = await prisma.trackingNumber.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'asc' },
    })

    // What each number has actually produced, from our own lead rows — every
    // tracked call is already stored with its number, outcome and duration,
    // so "is this number earning its dollar a month" needs no Twilio call.
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const calls = await prisma.lead
      .groupBy({
        by: ['trackingNumber', 'callStatus'],
        where: {
          clientId: id,
          trackingNumber: { in: numbers.map((n) => n.phoneNumber) },
          createdAt: { gte: since },
        },
        _count: { _all: true },
        _sum: { callDurationSecs: true },
      })
      .catch(() => [])

    const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled'])
    const stats: Record<string, { calls: number; missed: number; minutes: number }> = {}
    for (const row of calls) {
      const key = row.trackingNumber as string
      if (!key) continue
      const bucket = (stats[key] ??= { calls: 0, missed: 0, minutes: 0 })
      bucket.calls += row._count._all
      if (row.callStatus && MISSED.has(row.callStatus)) bucket.missed += row._count._all
      bucket.minutes += Math.round((row._sum.callDurationSecs ?? 0) / 60)
    }

    return NextResponse.json({ numbers, stats })
  } catch {
    // Table may not exist yet if the code deployed before the SQL ran.
    return NextResponse.json({ numbers: [], unavailable: true })
  }
}

/** Point a number's voice webhook at this app. */
async function repointInTwilio(
  phoneNumber: string,
  voiceUrl: string
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const creds = await twilioCreds()
  if (!creds) return { ok: false, error: 'No Twilio credentials saved.' }

  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  try {
    const lookup = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    )
    if (!lookup.ok) return { ok: false, error: `Twilio lookup failed (HTTP ${lookup.status}).` }
    const found = (await lookup.json()).incoming_phone_numbers?.[0]
    if (!found) {
      return {
        ok: false,
        error:
          'That number is not in this Twilio account. Numbers bought inside HighLevel live in their own Twilio subaccount and cannot be repointed from here.',
      }
    }

    const update = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers/${found.sid}.json`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: 'POST' }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!update.ok) {
      const detail = await update.text().catch(() => '')
      return { ok: false, error: `Twilio rejected the update (HTTP ${update.status}). ${detail.slice(0, 200)}` }
    }
    return { ok: true, sid: found.sid }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Twilio request failed' }
  }
}

/**
 * Buy a number from Twilio, already pointed at this app.
 *
 * The VoiceUrl rides in the purchase request itself, so there is no window —
 * not even a short one — where the number exists but rings nowhere. This is
 * the one way to get a tracking number that never needs the repoint step.
 *
 * Spends real money (Twilio's standard monthly rate for a US local number),
 * which is why it only runs when the caller explicitly asked to purchase.
 */
async function purchaseInTwilio(
  phoneNumber: string,
  voiceUrl: string
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const creds = await twilioCreds()
  if (!creds) return { ok: false, error: 'No Twilio credentials saved.' }

  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          PhoneNumber: phoneNumber,
          VoiceUrl: voiceUrl,
          VoiceMethod: 'POST',
          FriendlyName: 'glassleads tracking',
        }),
        signal: AbortSignal.timeout(20_000),
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 21422: no longer available — somebody else bought it between the
      // search and the click. Say so plainly; the fix is picking another.
      const message = String(data.message || `HTTP ${res.status}`)
      return {
        ok: false,
        error: message.includes('not available')
          ? 'That number was just taken. Search again and pick another.'
          : `Twilio refused the purchase: ${message}`,
      }
    }
    return { ok: true, sid: String(data.sid || '') }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Purchase failed' }
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const phoneNumber = toE164(String(body.phoneNumber || ''))
  const forwardTo = toE164(String(body.forwardTo || ''))
  if (!phoneNumber) {
    return NextResponse.json({ error: 'That is not a usable tracking number.' }, { status: 400 })
  }
  if (!forwardTo) {
    return NextResponse.json(
      { error: 'A forwarding number is required — calls have to ring somewhere.' },
      { status: 400 }
    )
  }
  if (phoneNumber === forwardTo) {
    return NextResponse.json(
      { error: 'The tracking number cannot forward to itself. That is a loop.' },
      { status: 400 }
    )
  }

  const existing = await prisma.trackingNumber
    .findUnique({ where: { phoneNumber }, include: { client: { select: { businessName: true } } } })
    .catch(() => null)
  if (existing && existing.clientId !== id) {
    return NextResponse.json(
      { error: `${phoneNumber} is already tracking for ${existing.client.businessName}.` },
      { status: 409 }
    )
  }

  const base = process.env.APP_URL || 'https://glassleads.app'
  const voiceUrl = `${base}/api/webhooks/twilio/voice`
  // Two ways in: point a number the account already owns, or buy a fresh one.
  // Buying is the explicit path — it costs money, so it never happens because
  // a flag defaulted wrong.
  const repoint =
    body.purchase === true
      ? await purchaseInTwilio(phoneNumber, voiceUrl)
      : await repointInTwilio(phoneNumber, voiceUrl)
  if (!repoint.ok) {
    return NextResponse.json({ error: repoint.error }, { status: 400 })
  }

  try {
    const data = {
      clientId: id,
      phoneNumber,
      forwardTo,
      twilioSid: repoint.sid ?? null,
      label: String(body.label || '').trim() || null,
      recordCalls: body.recordCalls !== false,
      announceRecording: body.announceRecording !== false,
      whisper: String(body.whisper || '').trim().slice(0, 200) || null,
      active: body.active !== false,
    }
    const number = existing
      ? await prisma.trackingNumber.update({ where: { id: existing.id }, data })
      : await prisma.trackingNumber.create({ data })
    return NextResponse.json({ number })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const numberId = new URL(request.url).searchParams.get('numberId')
  if (!numberId) return NextResponse.json({ error: 'Missing numberId' }, { status: 400 })

  try {
    // Only the routing row goes. The number itself stays in Twilio, still
    // billed, still yours — releasing a number is irreversible and is not
    // something a delete button in here should be able to do by accident.
    await prisma.trackingNumber.delete({ where: { id: numberId, clientId: id } })
    return NextResponse.json({
      ok: true,
      note: 'Removed from this client. The number is still in your Twilio account and its voice webhook still points here — repoint or release it in Twilio if you are finished with it.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not remove' },
      { status: 500 }
    )
  }
}
