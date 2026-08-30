import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { toE164 } from '@/lib/contact-links'
import { sendTestAlert } from '@/lib/test-alert'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value : String(value || '').split(/[\n,]/))
    .map((entry) => String(entry).trim())
    .filter(Boolean)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/



export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  try {
    const row = await prisma.clientNotification.findUnique({ where: { clientId: id } })
    return NextResponse.json({
      notification: {
        emailEnabled: row?.emailEnabled ?? false,
        emailTo: row?.emailTo ?? [],
        emailCallLeads: row?.emailCallLeads ?? true,
        smsEnabled: row?.smsEnabled ?? false,
        smsTo: row?.smsTo ?? [],
        smsActivatedAt: row?.smsActivatedAt ?? null,
        smsComplimentary: row?.smsComplimentary ?? false,
        smsNote: row?.smsNote ?? '',
        lastSentAt: row?.lastSentAt ?? null,
        lastError: row?.lastError ?? null,
      },
      // So the card can say "not configured" rather than letting an admin
      // switch on alerts that silently cannot send.
      providers: {
        email: !!(process.env.RESEND_API_KEY || (await hasSetting('RESEND_API_KEY'))),
        sms: !!(process.env.TWILIO_ACCOUNT_SID || (await hasSetting('TWILIO_ACCOUNT_SID'))),
      },
    })
  } catch {
    return NextResponse.json({ notification: null, unavailable: true })
  }
}

async function hasSetting(key: string): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } }).catch(() => null)
  return !!row?.value
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const emailTo = list(body.emailTo)
  const badEmail = emailTo.find((entry) => !EMAIL.test(entry))
  if (badEmail) {
    return NextResponse.json({ error: `"${badEmail}" is not an email address.` }, { status: 400 })
  }

  const rawSms = list(body.smsTo)
  const smsTo: string[] = []
  for (const entry of rawSms) {
    const normalized = toE164(entry)
    if (!normalized) {
      return NextResponse.json(
        { error: `"${entry}" is not a phone number we can text.` },
        { status: 400 }
      )
    }
    smsTo.push(normalized)
  }

  const emailEnabled = body.emailEnabled === true && emailTo.length > 0
  const smsEnabled = body.smsEnabled === true && smsTo.length > 0

  try {
    const existing = await prisma.clientNotification.findUnique({ where: { clientId: id } })
    // Stamp the activation only on the transition, so the billing date is the
    // day it was switched on and not the last time anyone edited the list.
    const smsActivatedAt =
      smsEnabled && !existing?.smsEnabled ? new Date() : smsEnabled ? existing?.smsActivatedAt : null

    const data = {
      emailEnabled,
      emailTo,
      // Defaults to on when the caller says nothing, which is what every
      // client had before the switch existed.
      emailCallLeads: body.emailCallLeads !== false,
      smsEnabled,
      smsTo,
      smsActivatedAt,
      smsComplimentary: smsEnabled ? body.smsComplimentary === true : false,
      smsNote: smsEnabled ? String(body.smsNote || '').trim().slice(0, 200) || null : null,
    }
    await prisma.clientNotification.upsert({
      where: { clientId: id },
      update: data,
      create: { clientId: id, ...data },
    })
  } catch (error) {
    console.error('Failed to save notifications:', error)
    return NextResponse.json(
      {
        error:
          'Could not save. If this is a fresh deploy, run /api/admin/setup-db to create the notifications table.',
      },
      { status: 503 }
    )
  }

  return NextResponse.json({ ok: true })
}

/**
 * POST — send a test alert to the saved recipients, and report what happened.
 *
 * `{ kind: "call" }` sends the INBOUND CALL variant instead of the form one.
 * Not decoration: a call alert is a different message (different eyebrow,
 * the time they rang) and it is the only one the "Email phone calls too"
 * switch touches — so this is how an admin proves that switch does what the
 * label says, rather than waiting for a real call to find out.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const isCall = body?.kind === 'call'

  // The message itself is built in test-alert.ts, shared with the portal
  // walkthrough's own "send me a test" button - the two must stay one
  // message, or the admin proves one alert works while the shop receives
  // another.
  const sent = await sendTestAlert(id, isCall ? 'call' : 'form')
  if (!('result' in sent)) {
    return NextResponse.json({ error: sent.error }, { status: 404 })
  }

  return NextResponse.json({
    ok: sent.ok,
    kind: isCall ? 'call' : 'form',
    emailSent: sent.result.emailSent,
    smsSent: sent.result.smsSent,
    errors: sent.result.errors,
  })
}
