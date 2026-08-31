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
import { hoursAnswerText } from '@/lib/business-hours'

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
          // ONBOARDING, not ACTIVE — the label that says setup is unfinished.
          // The SITE serves either way (siteIsLive() treats both as live, by
          // the owner's call): empty sections strip themselves, so a site
          // being built is leaner, never broken. What the label still gates
          // is operational: readiness prompts, and the rank-campaign sweep
          // which only takes ACTIVE clients.
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

    // The Google Ads account number links the account for the conversion
    // audit and offline uploads. Only a clean 10-digit id is written — the
    // raw answer stays on the intake for the review screen either way — and
    // an id already on the record is never overwritten by a blank.
    const adsId = String(answers.googleAdsCustomerId || '').replace(/\D/g, '')
    if (adsId.length === 10) {
      await prisma.clientAdsTracking.upsert({
        where: { clientId },
        update: { googleAdsCustomerId: adsId },
        create: { clientId, googleAdsCustomerId: adsId },
      })
    }

    // Opening hours land on the primary shop. They were being collected and
    // then dropped — hours live on ClientLocation, which nothing here wrote.
    // For a one-shop client with no rows this creates the primary row from
    // the address just approved; a client whose rows already exist gets the
    // hours applied to the primary and nothing else touched. Mobile-only
    // shops skip this: the site shows hours on shop cards, and they have no
    // shop card to show.
    const hours = hoursAnswerText(answers.hours)
    if (hours && core.hasShopLocation) {
      const primary = await prisma.clientLocation.findFirst({
        where: { clientId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      })
      if (primary) {
        await prisma.clientLocation.update({ where: { id: primary.id }, data: { hours } })
      } else {
        await prisma.clientLocation.create({
          data: {
            clientId,
            label: core.city,
            streetAddress: core.streetAddress,
            city: core.city,
            state: core.state,
            postalCode: core.postalCode,
            hours,
            isPrimary: true,
          },
        })
      }
    }

    await prisma.clientIntake.update({
      where: { id: intake.id },
      data: { status: 'APPROVED', approvedAt: new Date(), clientId, answers: answers as never },
    })

    // DELIBERATELY NO EMAIL TO THE SHOP. Approval makes their answers the
    // record; it does not open the door. The portal invite is a manual send
    // from the client page, after the operator decides the setup is worth a
    // first look — an invite fired here would land while the site is still
    // half-built, and first impressions are the product.
    return NextResponse.json({ ok: true, clientId })
  } catch (error) {
    console.error('Failed to approve intake:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not approve this.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE — take an intake off the list.
 *
 * Only the intake row goes. A client an approval created stays a client —
 * deleting the paperwork does not un-create the business. What deletion DOES
 * revoke is the invite link: the token resolves by row id, so a deleted
 * intake's link dies with it, which is also the way to kill an invite that
 * went to the wrong address.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  try {
    await prisma.clientIntake.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

