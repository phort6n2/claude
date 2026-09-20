import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import {
  programFor,
  readProgramRecord,
  readSteps,
  publishProblem,
  programPath,
  MAX_STEPS,
} from '@/lib/insurance-programs'

export const dynamic = 'force-dynamic'

/**
 * The insurance-claim page's record — see lib/insurance-programs.ts.
 *
 *   PUT  { programKey, inNetwork, coverageNote, claimSteps, metaDescription,
 *          publish }   → save, and publish or unpublish
 *   DELETE                                    → remove the page entirely
 *
 * PUBLISHING IS REFUSED, NOT WARNED ABOUT. This page is what an ad points at,
 * and an empty one costs the same per click as a full one while answering
 * nothing — so `publishProblem` is a 400 with its own reason rather than a
 * banner somebody can press past. Saving an incomplete record is fine and
 * normal: that is what a draft is.
 *
 * `inNetwork` IS A CLAIM ABOUT A RELATIONSHIP WITH AN INSURER, which § 2
 * otherwise forbids outright. It is accepted here only for a programme whose
 * network this platform has confirmed the NAME of, because a membership claim
 * with nothing named is unfalsifiable — and it is stored as a tick rather
 * than free text so that nobody can widen it into "approved by" on the way in.
 */

interface Body {
  programKey?: unknown
  inNetwork?: unknown
  coverageNote?: unknown
  claimSteps?: unknown
  metaDescription?: unknown
  publish?: unknown
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Body

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, slug: true, siteSubdomain: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const program = programFor(body.programKey as string)
  if (!program) {
    return NextResponse.json({ error: 'Pick one of the insurance pages.' }, { status: 400 })
  }

  const steps = readSteps(body.claimSteps)
  if (Array.isArray(body.claimSteps) && body.claimSteps.length > MAX_STEPS) {
    return NextResponse.json(
      { error: `${MAX_STEPS} steps is the most this page renders. Merge a couple.` },
      { status: 400 }
    )
  }

  // A tick on a programme with no confirmed network name is dropped rather
  // than rejected: nothing renders from it either way, and refusing the whole
  // save over a tick that does nothing would be a puzzle with no clue in it.
  const inNetwork = body.inNetwork === true && !!program.networkName

  const record = {
    programKey: program.key,
    inNetwork,
    coverageNote: text(body.coverageNote),
    claimSteps: steps,
    metaDescription: text(body.metaDescription),
    publishedAt: null as Date | null,
  }

  const existing = await prisma.clientInsuranceProgram
    .findUnique({ where: { clientId: id } })
    .catch(() => null)
  const wasPublished = !!existing?.publishedAt

  const wantPublished = body.publish === undefined ? wasPublished : body.publish === true
  if (wantPublished) {
    const problem = publishProblem({ ...record, publishedAt: null })
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    // Keep the original publish date rather than restamping it on every save:
    // it is when the page went live, and the sitemap's lastmod comes from
    // the client row anyway.
    record.publishedAt = existing?.publishedAt || new Date()
  }

  const saved = await prisma.clientInsuranceProgram.upsert({
    where: { clientId: id },
    create: { clientId: id, ...record, claimSteps: record.claimSteps as never },
    update: { ...record, claimSteps: record.claimSteps as never },
  })

  // The page itself, and every page that reads the affiliation line off it.
  revalidatePath(`/sites/${client.siteSubdomain || client.slug}`, 'layout')

  return NextResponse.json({
    program: readProgramRecord(saved),
    path: programPath(program),
    published: !!saved.publishedAt,
    // Said in words rather than inferred from the flag, because "saved" and
    // "live" are the two states an operator confuses here and the difference
    // is whether an ad may point at it yet.
    message: saved.publishedAt
      ? `Saved and live at ${programPath(program)}.`
      : `Saved as a draft. ${programPath(program)} 404s until you publish it.`,
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params

  const client = await prisma.client.findUnique({
    where: { id },
    select: { slug: true, siteSubdomain: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  await prisma.clientInsuranceProgram.deleteMany({ where: { clientId: id } })
  revalidatePath(`/sites/${client.siteSubdomain || client.slug}`, 'layout')
  return NextResponse.json({
    program: null,
    // An address that was in the sitemap and is now a 404 is worth saying out
    // loud: anything already pointing at it — an ad, a link — now pays for a
    // 404, and nothing else in the app would mention it.
    message:
      'Removed. That address now 404s, so change any ad or link still pointing at it.',
  })
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
