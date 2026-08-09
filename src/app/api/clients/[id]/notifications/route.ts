import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
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

/** Ten digits, or eleven starting with 1, or an explicit +country number. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.trim().startsWith('+') && digits.length >= 8) return `+${digits}`
  return null
}

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
    const normalized = normalizePhone(entry)
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

/** POST — send a test alert to the saved recipients, and report what happened. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true, phone: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const result = await notifyNewLead(id, client.businessName, {
    name: 'Test Lead',
    phone: client.phone,
    email: 'webhook-test@glassleads.app',
    service: 'Windshield Replacement',
    vehicle: '2020 Hyundai Santa Fe',
    postalCode: '97132',
    message: 'This is a test alert from glassleads.app. Safe to ignore.',
    source: 'Admin test',
    leadUrl: null,
  })

  return NextResponse.json({
    ok: result.errors.length === 0,
    emailSent: result.emailSent,
    smsSent: result.smsSent,
    errors: result.errors,
  })
}
