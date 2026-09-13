import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { scanSocialLinks } from '@/lib/social-scan'
import { LIVE_STATUSES } from '@/lib/site-preview'
import {
  SOCIAL_PLATFORMS,
  countSocialLinks,
  readSocialLinks,
  type SocialLinks,
} from '@/lib/social-links'
import { syncClientToWrhq, WRHQ_SYNC_SELECT } from '@/lib/wrhq-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Stop before the platform does, and name who was not reached. */
const TIME_BUDGET_MS = 240_000

/**
 * POST — read every client's social profiles off their own website, and store
 * the ones nobody has on file yet.
 *
 * WHY A SWEEP AND NOT JUST THE PER-CLIENT BUTTON. The extractor arrived inside
 * the website importer, which means it only ever ran for a client somebody was
 * importing — and every client already on the platform was imported months
 * ago. So the feature shipped able to fill in profiles for shops that do not
 * exist yet and not for the fifteen that do. Fifteen presses of a per-client
 * button is the same friction that left twenty city pages blank
 * (`city-content/draft-all` records that), so: one press, one page fetched per
 * client, and a line per client saying what happened.
 *
 * NON-DESTRUCTIVE, AND THAT IS THE WHOLE LICENCE FOR IT SAVING. It only ever
 * FILLS A GAP: a platform a client already has a link for is left exactly as
 * it is, because the Business tab card is where a wrong one gets corrected and
 * a sweep that overwrote corrections would undo them every time somebody ran
 * it. The values still go through the same screen as everything else, so a
 * share button cannot be stored by this route either.
 *
 * `?dryRun=1` reports what it would store and writes nothing — the Maintenance
 * runner sends no body, which is why it is read off the query string the way
 * the WRHQ backfill's is.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const dryRun =
    body?.dryRun === true || new URL(request.url).searchParams.get('dryRun') === '1'

  const clients = await prisma.client.findMany({
    // Live clients only: a PAUSED shop's listing is deliberately demoted and
    // does not need fresh data, and this costs a fetch per client.
    where: { status: { in: [...LIVE_STATUSES] } },
    select: { id: true, businessName: true, websiteUrl: true, socialLinks: true },
    orderBy: { businessName: 'asc' },
  })

  const started = Date.now()
  const results: Array<Record<string, unknown>> = []
  const notReached: string[] = []
  let stored = 0

  for (const client of clients) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      notReached.push(client.businessName)
      continue
    }
    // No website on file is a fact about the client, not a failure of the
    // sweep — and it is fixable on the Website tab, so it is named.
    if (!client.websiteUrl) {
      results.push({ client: client.businessName, skipped: 'no website on file' })
      continue
    }

    const scan = await scanSocialLinks(client.websiteUrl)
    if (!scan.ok) {
      results.push({ client: client.businessName, error: scan.error })
      continue
    }

    const existing = readSocialLinks(client.socialLinks)
    const gaps: SocialLinks = {}
    for (const platform of SOCIAL_PLATFORMS) {
      const found = scan.links[platform]
      if (found && !existing[platform]) gaps[platform] = found
    }
    const added = countSocialLinks(gaps)
    if (!added) {
      results.push({
        client: client.businessName,
        // Two different nothings, and only one of them is worth acting on.
        note: countSocialLinks(existing)
          ? 'nothing new — already on file'
          : 'no profiles found on their site',
        found: countSocialLinks(scan.links),
      })
      continue
    }

    if (dryRun) {
      results.push({ client: client.businessName, would: gaps })
      continue
    }

    const next = { ...existing, ...gaps }
    try {
      await prisma.client.update({ where: { id: client.id }, data: { socialLinks: next } })
    } catch (error) {
      results.push({
        client: client.businessName,
        error:
          error instanceof Error
            ? error.message
            : 'Could not save — if this is a fresh deploy, run /api/admin/setup-db',
      })
      continue
    }
    stored += added

    /* PUSHED TO THE DIRECTORY HERE, because this route writes with prisma
       directly. The clients API triggers the sync on every edit; a bulk write
       that skipped it would store fifteen shops' profiles and leave every
       listing unchanged until somebody happened to edit each client — which is
       the same silence the intake-approval path had before it learned to
       sync. Best-effort: a directory that is down must not lose the row we
       just wrote. */
    const full = await prisma.client
      .findUnique({ where: { id: client.id }, select: WRHQ_SYNC_SELECT })
      .catch(() => null)
    const pushed = full ? await syncClientToWrhq(full) : { ok: false, error: 'Client vanished' }
    results.push({
      client: client.businessName,
      added: gaps,
      ...(pushed.ok || pushed.skipped ? {} : { directory: `not updated: ${pushed.error}` }),
    })
  }

  const withErrors = results.filter((r) => r.error).length
  const changed = results.filter((r) => r.added || r.would).length

  return NextResponse.json({
    ok: true,
    dryRun,
    clients: clients.length,
    changed,
    stored,
    failed: withErrors,
    notReached,
    results,
    message:
      [
        dryRun
          ? changed
            ? `${changed} client${changed === 1 ? '' : 's'} would gain profiles (${stored || 'see results'})`
            : 'Nothing to add'
          : stored
            ? `Stored ${stored} profile${stored === 1 ? '' : 's'} across ${changed} client${changed === 1 ? '' : 's'}`
            : 'Nothing new to store',
        withErrors ? `${withErrors} site${withErrors === 1 ? '' : 's'} could not be read` : '',
        notReached.length ? `${notReached.length} not reached — run it again` : '',
      ]
        .filter(Boolean)
        .join(' · ') +
      '. Check each one on the client’s Business tab — a real account that belongs to whoever built their site looks exactly like theirs from here.',
  })
}
