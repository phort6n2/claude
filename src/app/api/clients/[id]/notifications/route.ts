import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { toE164 } from '@/lib/contact-links'
import { notifyNewLead } from '@/lib/lead-notifications'

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
  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true, phone: true, timezone: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const isCall = body?.kind === 'call'
  // Formatted here, in the shop's own zone, exactly as the intake does it for
  // a real call — the whole point of the line is that it reads as the local
  // time the customer rang, not the time where this server happens to run.
  const calledAtLabel = isCall
    ? (() => {
        try {
          return new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
            timeZone: client.timezone || 'America/Denver',
          }).format(new Date())
        } catch {
          return undefined
        }
      })()
    : undefined

  // The test must be a faithful replica of a real alert — every button, every
  // row. A test that omits pieces is how missing pieces go unnoticed, and
  // ALSO how present pieces get reported as broken: a test email without the
  // Call/Text/booked buttons reads as "the alerts are broken", when the only
  // thing missing was in the test.
  //
  // Call/Text dial the CUSTOMER on a real alert; here the shop's own number
  // plays the customer, which doubles as a nice self-check — unless that
  // number does not parse (fictional clients, short numbers), in which case a
  // reserved fictional number stands in so the buttons still render.
  const phone = toE164(client.phone) ? client.phone : '(800) 555-0199'

  // The booked/didn't-book buttons need a lead to point at. Use the client's
  // most recent one so the whole flow is clickable end to end; a brand-new
  // client with no leads yet gets a note instead of silently missing buttons.
  const latestLead = await prisma.lead
    .findFirst({ where: { clientId: id }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    .catch(() => null)
  const { outcomeUrlFor } = await import('@/lib/lead-outcome-token')
  const outcomeUrl = latestLead ? outcomeUrlFor(latestLead.id) : null

  const result = await notifyNewLead(id, client.businessName, {
    isCall,
    calledAtLabel,
    name: isCall ? 'Test Caller' : 'Test Lead',
    phone,
    email: 'webhook-test@glassleads.app',
    service: 'Windshield Replacement',
    vehicle: '2020 Hyundai Santa Fe',
    postalCode: '97132',
    message: outcomeUrl
      ? 'This is a test alert from glassleads.app. Safe to ignore. The booked buttons below point at this client\u2019s most recent lead.'
      : 'This is a test alert from glassleads.app. Safe to ignore. Real alerts also carry one-tap \u201cWe booked it\u201d buttons \u2014 they appear once this client has a lead to point them at.',
    source: isCall ? 'Admin test — inbound call' : 'Admin test',
    leadUrl: null,
    vin: '5NMS3CAD4LH123456',
    insurance: 'Filing through insurance',
    carrier: 'State Farm',
    landingPage: 'https://glassleads.app/admin (test)',
    outcomeUrl,
  })

  return NextResponse.json({
    ok: result.errors.length === 0,
    kind: isCall ? 'call' : 'form',
    emailSent: result.emailSent,
    smsSent: result.smsSent,
    errors: result.errors,
  })
}
