import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { intakeUrlFor } from '@/lib/intake-token'
import {
  clientFromAnswers,
  missingRequired,
  notificationFromAnswers,
  sectionsFor,
  siteContentFromAnswers,
  type IntakeAnswers,
} from '@/lib/client-intake'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET — one intake, with the question set so the review page can label it. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const intake = await prisma.clientIntake.findUnique({ where: { id } }).catch(() => null)
  if (!intake) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const answers = (intake.answers as IntakeAnswers) || {}
  return NextResponse.json({
    intake: { ...intake, url: intakeUrlFor(intake.id) },
    sections: sectionsFor(intake.seo),
    missing: missingRequired(answers, intake.seo),
  })
}

/**
 * POST — approve it, and only then write anything real.
 *
 * This is the line the whole feature is drawn around. Everything up to here
 * is a shop's own words in a draft; this is where they become a business's
 * public site. So it happens once, deliberately, after a human has read them
 * — never on submit, and never automatically for a "trusted" client.
 *
 * The admin may have corrected the answers on the review screen, so the body
 * wins over what is stored: what was read is what gets applied.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const intake = await prisma.clientIntake.findUnique({ where: { id } }).catch(() => null)
  if (!intake) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (intake.status === 'APPROVED') {
    return NextResponse.json({ error: 'Already approved.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const answers = ((body.answers as IntakeAnswers) || (intake.answers as IntakeAnswers) || {}) as IntakeAnswers

  const missing = missingRequired(answers, intake.seo)
  if (missing.length) {
    return NextResponse.json({ error: `Still missing: ${missing.join(', ')}` }, { status: 400 })
  }

  const core = clientFromAnswers(answers)
  const notification = notificationFromAnswers(answers)
  const content = siteContentFromAnswers(answers)

  try {
    let clientId = intake.clientId

    if (clientId) {
      // EXISTING: apply the corrections to the record we already have. The
      // shop's answers win on the fields they were shown — that is what
      // asking them was for — and nothing else on the client is touched.
      await prisma.client.update({ where: { id: clientId }, data: core })
    } else {
      // NEW: a slug has to be unique and is derived rather than typed, the
      // same way the admin create form does it.
      const base =
        core.businessName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 40) || 'shop'
      let slug = base
      for (let n = 2; await prisma.client.findUnique({ where: { slug } }); n += 1) {
        slug = `${base}-${n}`
      }
      const created = await prisma.client.create({
        data: {
          ...core,
          slug,
          // ONBOARDING, not ACTIVE. Approving the answers is not the same as
          // declaring the site finished — photos, logo and the Google Ads
          // wiring still happen after this, and a client that goes live the
          // moment a form is approved is one that goes live half-built.
          status: 'ONBOARDING',
          seoClient: intake.seo,
        },
      })
      clientId = created.id
    }

    await prisma.clientNotification.upsert({
      where: { clientId },
      update: notification,
      create: { clientId, ...notification },
    })

    if (content) {
      await prisma.clientSiteContent.upsert({
        where: { clientId },
        update: content,
        create: { clientId, ...content },
      })
    }

    await prisma.clientIntake.update({
      where: { id: intake.id },
      data: { status: 'APPROVED', approvedAt: new Date(), clientId, answers: answers as never },
    })

    return NextResponse.json({ ok: true, clientId })
  } catch (error) {
    console.error('Failed to approve intake:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not approve this.' },
      { status: 500 }
    )
  }
}
