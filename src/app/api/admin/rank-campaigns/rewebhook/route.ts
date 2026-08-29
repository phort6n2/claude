import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { getScheduledScanSchedule, updateScheduledScan } from '@/lib/local-dominator'
import { rankWebhookUrl } from '@/lib/local-rank-token'
import { appOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — re-register the webhook URL on every campaign.
 *
 * The URL is set once, when a campaign is created, and never again. Its
 * token is DERIVED from a server secret rather than stored, so anything that
 * changes which secret is chosen — a new environment variable higher in the
 * fallback chain, a rotated key, a move between projects — silently
 * invalidates every URL Local Dominator holds. Their scheduler keeps running
 * the scans and every delivery is rejected, which from the outside looks
 * exactly like "the rank map stopped updating" and nothing anywhere says
 * otherwise.
 *
 * Separate from the audit on purpose: this WRITES to their side, and the
 * endpoint that tells you what is wrong should never be the one that changes
 * things. Run cadence first, read the mismatch, then run this.
 *
 * PATCH rather than delete-and-recreate: the campaign keeps its id, its
 * history and its credits.
 *
 * WHAT IT FIXED THE FIRST TIME IT RAN. Every campaign was registered on
 * `agmp-paa-pro.vercel.app`, a Vercel deployment URL, because the origin used
 * to come from VERCEL_PROJECT_PRODUCTION_URL. This project has Vercel
 * Authentication on for everything except custom domains, so their scheduler
 * met an SSO challenge on every delivery and a week of scans was lost with no
 * error on either side. appOrigin() now refuses to build a webhook URL on
 * that host at all.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const origin = appOrigin()

  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { id: true, businessName: true, rankTrackingId: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  const results = []
  for (const client of clients) {
    const id = client.rankTrackingId as string
    const url = rankWebhookUrl(origin, client.id)
    const before = await getScheduledScanSchedule(id)

    if (before?.webhookUrl && before.webhookUrl.trim() === url.trim()) {
      results.push({ client: client.businessName, changed: false, note: 'Already correct.' })
      continue
    }

    const patched = await updateScheduledScan(id, { webhookUrl: url })
    const ok = patched.ok
    // Read it back rather than trusting the PATCH's own answer: the whole
    // point of this endpoint is that a URL nobody verified was wrong for a
    // week.
    const after = ok ? await getScheduledScanSchedule(id) : null
    results.push({
      client: client.businessName,
      changed: ok,
      error: patched.ok ? undefined : patched.error,
      was: before?.webhookUrl ?? null,
      now: after?.webhookUrl ?? null,
      verified: !!after?.webhookUrl && after.webhookUrl.trim() === url.trim(),
    })
  }

  return NextResponse.json({ origin, updated: results.filter((r) => r.changed).length, results })
}
