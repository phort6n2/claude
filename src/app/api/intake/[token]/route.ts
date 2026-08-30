import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { intakeIdFromToken } from '@/lib/intake-token'
import { missingRequired, sectionsFor, type IntakeAnswers } from '@/lib/client-intake'
import { deliverabilityGuide } from '@/lib/alert-deliverability'

export const dynamic = 'force-dynamic'

/**
 * The public end of the intake. No session — the token IS the authority, and
 * it grants exactly one intake's answers.
 *
 * Note what is NOT returned: no client id, no other intake, nothing about the
 * account. A leaked link exposes a draft that a human has to approve before
 * it means anything.
 */
async function load(token: string) {
  const id = intakeIdFromToken(token)
  if (!id) return null
  return prisma.clientIntake.findUnique({ where: { id } }).catch(() => null)
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const intake = await load(token)
  if (!intake) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })

  return NextResponse.json({
    businessName: intake.businessName,
    kind: intake.kind,
    seo: intake.seo,
    status: intake.status,
    answers: (intake.answers as IntakeAnswers) || {},
    sections: sectionsFor(intake.seo),
    // Sent with the form so the whitelist steps name the addresses that
    // actually send, rather than whatever was true when this was written.
    deliverability: await deliverabilityGuide(),
  })
}

/** PUT — save progress. Called as they type; never validates, never submits. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const intake = await load(token)
  if (!intake) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (intake.status === 'APPROVED') {
    return NextResponse.json({ error: 'This has already been set up.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const answers = (body.answers || {}) as IntakeAnswers

  await prisma.clientIntake.update({
    where: { id: intake.id },
    data: {
      answers: answers as never,
      // First save is what "started" means. Stamped once so a half-finished
      // form is distinguishable from one nobody opened — which is the
      // difference between chasing the shop and chasing the email.
      startedAt: intake.startedAt ?? new Date(),
      status: intake.status === 'SENT' ? 'STARTED' : intake.status,
    },
  })

  return NextResponse.json({ ok: true })
}

/** POST — submit for review. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const intake = await load(token)
  if (!intake) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const answers = (body.answers || intake.answers || {}) as IntakeAnswers

  const missing = missingRequired(answers, intake.seo)
  if (missing.length) {
    return NextResponse.json({ error: 'Some answers are still needed.', missing }, { status: 400 })
  }

  await prisma.clientIntake.update({
    where: { id: intake.id },
    data: { answers: answers as never, status: 'SUBMITTED', submittedAt: new Date() },
  })

  // Tell the admin — on the TRANSITION only, so pressing submit twice (or
  // re-submitting after an edit) does not stack emails. The result is
  // ignored on purpose: the submission is saved either way, and the intake
  // list still shows "Waiting on you" if the email never arrives.
  if (intake.status !== 'SUBMITTED') {
    const { sendIntakeSubmittedEmail } = await import('@/lib/intake-email')
    await sendIntakeSubmittedEmail({
      intakeId: intake.id,
      businessName: intake.businessName,
      email: intake.email,
      kind: intake.kind,
      seo: intake.seo,
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
