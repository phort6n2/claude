import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { draftCityCopy } from '@/lib/city-copy-writer'
import { CITY_CONTENT_MIN_WORDS, countWords } from '@/lib/city-content'
import { locationPages, mergeServiceAreas } from '@/lib/site-locations'
import { claimProblem, type ClaimContext } from '@/lib/copy-claims'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Stop before the platform does, and name who was not reached. */
const TIME_BUDGET_MS = 240_000

/**
 * POST — write the copy for every city page that has none, and save it.
 *
 * WHY THIS SAVES WHEN THE SINGLE-CITY DRAFT DELIBERATELY DOES NOT. That one
 * hands the text to the editor for a human to read first, which is right when
 * there is one city in front of you. It does not survive contact with sixty
 * of them: a client with twenty service areas means twenty presses, twenty
 * reads and twenty saves, and the actual outcome of that friction is measured
 * — city pages left blank, carrying noindex, not linked and not in the
 * sitemap, which is the exact state `city-content.ts` exists to prevent. An
 * unwritten page helps nobody more than an imperfect one a shop can edit.
 *
 * SO THE SCREEN REPLACES THE READER, and it has to be a real one. Every draft
 * goes through `claimProblem()` — the same compliance screen the story and
 * FAQ drafters use — and a draft that trips it is NOT SAVED. This is the
 * first place in the app where model prose reaches a live page without
 * somebody reading it first, so the drop has to be the default and the
 * report has to name what happened to every city.
 *
 * NON-DESTRUCTIVE. Only cities with NO copy at all are written. A city
 * somebody has already written or corrected is skipped and counted, because
 * "I am tired of doing it one by one" is about the empty ones, and a bulk
 * action that overwrites a hand-edited paragraph is one nobody presses twice.
 *
 * Sequential, with a time budget: these are model calls, and a client can
 * have up to LOCATION_PAGE_LIMIT cities. Run it again to continue.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      slug: true,
      serviceAreas: true,
      hasShopLocation: true,
      offersMobileService: true,
      filesInsuranceClaims: true,
      smsCapable: true,
      offersWindshieldReplacement: true,
      offersWindshieldRepair: true,
      offersRockChipRepair: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersAdasCalibration: true,
      locations: { select: { city: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const claims: ClaimContext = {
    hasShopLocation: client.hasShopLocation,
    offersMobileService: client.offersMobileService,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
    services: {
      offersWindshieldReplacement: client.offersWindshieldReplacement,
      offersWindshieldRepair: client.offersWindshieldRepair,
      offersRockChipRepair: client.offersRockChipRepair,
      offersSideWindowRepair: client.offersSideWindowRepair,
      offersBackWindowRepair: client.offersBackWindowRepair,
      offersSunroofRepair: client.offersSunroofRepair,
      offersAdasCalibration: client.offersAdasCalibration,
    },
  }

  // The same list the site builds its pages from, so this can never write a
  // city that has no page or miss one that does.
  const areas = mergeServiceAreas(
    client.serviceAreas || [],
    client.locations.map((l) => l.city)
  )
  const pages = locationPages(areas)
  const existing = await prisma.clientCityContent
    .findMany({ where: { clientId: id }, select: { city: true, body: true } })
    .catch(() => [])
  const written = new Map(existing.map((row) => [row.city.trim().toLowerCase(), row.body || '']))

  const started = Date.now()
  const results: Array<Record<string, unknown>> = []
  const notReached: string[] = []
  let wrote = 0

  for (const page of pages) {
    const key = page.area.trim().toLowerCase()
    if ((written.get(key) || '').trim()) {
      results.push({ city: page.area, skipped: 'already written' })
      continue
    }
    if (Date.now() - started > TIME_BUDGET_MS) {
      notReached.push(page.area)
      continue
    }

    const drafted = await draftCityCopy({ clientId: id, city: page.area })
    if (!drafted.ok) {
      results.push({ city: page.area, error: drafted.error })
      continue
    }

    /* THE SCREEN. Nothing reaches a live page without passing it — see the
       note above. The reason is reported with the words that tripped it, so a
       drop reads as the tool working rather than as the city being missed. */
    const tripped = claimProblem(`${drafted.draft.heading}\n${drafted.draft.body}`, claims)
    if (tripped) {
      results.push({
        city: page.area,
        dropped: `${tripped.reason} (“${tripped.match.trim()}”)`,
        // Kept in the response so an operator can judge the drop and paste
        // the good half by hand rather than losing it entirely.
        draft: drafted.draft.body,
      })
      continue
    }

    const words = countWords(drafted.draft.body)
    try {
      await prisma.clientCityContent.upsert({
        where: { clientId_city: { clientId: id, city: page.area } },
        update: { heading: drafted.draft.heading, body: drafted.draft.body },
        create: { clientId: id, city: page.area, heading: drafted.draft.heading, body: drafted.draft.body },
      })
    } catch (error) {
      results.push({
        city: page.area,
        error:
          error instanceof Error
            ? error.message
            : 'Could not save — if this is a fresh deploy, run /api/admin/setup-db',
      })
      continue
    }

    wrote++
    results.push({
      city: page.area,
      written: true,
      words,
      // Below the bar is still worth saving — it is more than the page had —
      // but it is worth saying, because the page stays noindexed until it
      // clears it and nothing else on this screen would explain why.
      ...(words < CITY_CONTENT_MIN_WORDS
        ? { note: `only ${words} words — still under the ${CITY_CONTENT_MIN_WORDS} needed to be indexed` }
        : {}),
    })
  }

  // Once, at the end. Every city page renders from the same layout.
  if (wrote) revalidatePath(`/sites/${client.slug}`, 'layout')

  const dropped = results.filter((r) => r.dropped)
  const failed = results.filter((r) => r.error)
  const skipped = results.filter((r) => r.skipped)

  return NextResponse.json({
    ok: true,
    wrote,
    skipped: skipped.length,
    dropped: dropped.length,
    failed: failed.length,
    notReached,
    results,
    message:
      [
        wrote ? `Wrote ${wrote} city page${wrote === 1 ? '' : 's'}` : 'Nothing new to write',
        skipped.length ? `${skipped.length} already had copy` : '',
        dropped.length
          ? `${dropped.length} thrown away by the compliance screen (${dropped
              .map((d) => `${d.city}: ${d.dropped}`)
              .join('; ')})`
          : '',
        failed.length ? `${failed.length} failed` : '',
        notReached.length ? `${notReached.length} not reached — run it again` : '',
      ]
        .filter(Boolean)
        .join(' · ') + '. Read what it wrote before you move on.',
  })
}
