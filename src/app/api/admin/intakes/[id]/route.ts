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

    // The walkthrough starts here: a portal account for whoever filled the
    // form, and the "you're in" email carrying a signed-in link to it. Sent
    // to the address the intake went to — the one address that has already
    // proven it reaches a human — not the business email off the form.
    //
    // Failures are reported, never fatal: the approval already happened, and
    // un-approving a client because an email bounced would be backwards. The
    // admin sees what did not send and the login page can mint a fresh link
    // any time.
    const followUp = await sendPortalInvite(
      clientId,
      intake.email,
      core.businessName,
      core.contactPerson,
      intake.kind
    )

    return NextResponse.json({ ok: true, clientId, followUp })
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

/**
 * A portal account for the person who filled the form, and the email that
 * hands them the door. Returns what happened rather than throwing — by the
 * time this runs the approval is already real.
 */
async function sendPortalInvite(
  clientId: string,
  email: string,
  businessName: string,
  name: string | null,
  kind: string
): Promise<{ emailed: boolean; to?: string; note?: string }> {
  const addr = email.toLowerCase().trim()
  try {
    const existing = await prisma.clientUser.findUnique({
      where: { email: addr },
      select: { clientId: true },
    })
    // Emails are one login each, platform-wide. An address already attached
    // to ANOTHER client is not silently reassigned — that would swap someone
    // out of their own portal because a form reused their email.
    if (existing && existing.clientId !== clientId) {
      return {
        emailed: false,
        note: `${addr} already signs in to a different client's portal, so no invite was sent. Add a different address on the Users tab.`,
      }
    }
    if (!existing) {
      await prisma.clientUser.create({ data: { clientId, email: addr, name: name || null } })
    }

    const { createMagicLink } = await import('@/lib/portal-auth')
    const { portalVerifyUrl, sendApprovedEmail } = await import('@/lib/portal-email')
    const link = await createMagicLink(addr)
    const base = process.env.APP_URL || 'https://glassleads.app'
    // A link that could not be minted degrades to the login page, where a
    // fresh one is self-serve — never a broken button in the one email that
    // announces the account works.
    const url = link.success && link.token ? portalVerifyUrl(link.token) : `${base}/portal/login`

    const sent = await sendApprovedEmail({
      to: addr,
      businessName,
      url,
      kind: kind === 'EXISTING' ? 'EXISTING' : 'NEW',
    })
    if (!sent.ok) {
      return { emailed: false, note: `Approved, but the portal email failed: ${sent.error}` }
    }
    return { emailed: true, to: addr }
  } catch (error) {
    return {
      emailed: false,
      note: `Approved, but the portal invite failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}
