import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { intakeUrlFor } from '@/lib/intake-token'
import { sendWelcomeEmail } from '@/lib/intake-email'
import { clientFromAnswers } from '@/lib/client-intake'

export const dynamic = 'force-dynamic'

/** GET — every intake, newest first. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const intakes = await prisma.clientIntake.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({
      intakes: intakes.map((intake) => ({
        ...intake,
        url: intakeUrlFor(intake.id),
      })),
    })
  } catch {
    return NextResponse.json({ intakes: [], unavailable: true })
  }
}

/**
 * POST — invite somebody.
 *
 * Two kinds, and the difference is who does the typing:
 *
 * NEW — a shop that does not exist here yet. Blank form; approving it creates
 * the client.
 *
 * EXISTING — a shop already set up by an admin, which is most of them, and
 * none of whom have logged in. Their answers are PREFILLED from the record we
 * already hold so the ask is "check this and tell us where your leads go",
 * not "type your address again". Approving applies the diff.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  // For an existing client the plan is already on the record, so the caller
  // only has to say otherwise.
  let seo = body.seo === true

  let businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
  let email = typeof body.email === 'string' ? body.email.trim() : ''
  let answers: Record<string, unknown> | undefined

  if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { notification: true, siteContent: true },
    })
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    businessName = client.businessName
    email = email || client.email
    if (body.seo === undefined) seo = client.seoClient
    // Prefilled from what we hold. clientFromAnswers is the map the other way,
    // so the two stay in step: a field added there is a field prefilled here.
    answers = {
      ...clientFromAnswers(client as unknown as Record<string, unknown>),
      businessName: client.businessName,
      contactPerson: client.contactPerson || '',
      timezone: client.timezone,
      websiteUrl: client.websiteUrl || '',
      googleMapsUrl: client.googleMapsUrl || '',
      serviceAreas: client.serviceAreas || [],
      warrantyTitle: client.siteContent?.warrantyTitle || '',
      warrantyText: client.siteContent?.warrantyText || '',
      notifyEmails: client.notification?.emailTo || [],
      notifyPhones: client.notification?.smsTo || [],
      emailCallLeads: client.notification?.emailCallLeads ?? true,
    }
  }

  if (!businessName || !email) {
    return NextResponse.json({ error: 'A business name and an email address are required.' }, { status: 400 })
  }

  try {
    const intake = await prisma.clientIntake.create({
      data: {
        businessName,
        email,
        seo,
        kind: clientId ? 'EXISTING' : 'NEW',
        clientId: clientId || null,
        answers: answers as never,
        sentAt: new Date(),
      },
    })

    const url = intakeUrlFor(intake.id)
    if (!url) {
      return NextResponse.json(
        { error: 'No signing key configured, so the invite link cannot be made.' },
        { status: 500 }
      )
    }

    // The email is best-effort and the link is returned either way: a mail
    // provider being down should not mean the invite cannot be sent at all,
    // and pasting the link into a message by hand is a perfectly good
    // fallback that a failed send would otherwise hide.
    const sent = await sendWelcomeEmail({
      to: email,
      businessName,
      url,
      kind: intake.kind as 'NEW' | 'EXISTING',
    })

    return NextResponse.json({ intake, url, emailed: sent.ok, emailError: sent.error })
  } catch (error) {
    console.error('Failed to create intake:', error)
    return NextResponse.json(
      { error: 'Could not create the invite. If this is a fresh deploy, run /api/admin/setup-db.' },
      { status: 503 }
    )
  }
}
