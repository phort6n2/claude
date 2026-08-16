import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { campaignDetail, localDominatorShareHost } from '@/lib/local-dominator'
import { whiteLabelEmbedUrl } from '@/lib/rank-embed'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — fetch each campaign's all-keywords map URL, store it, and report.
 *
 * This exists because several rounds were spent inferring production state
 * from a screenshot. Every link in the chain can be checked directly: is a
 * share host set, does the campaign have a campaign_link yet, what URL does
 * that produce, and does it match what is stored on the client. One call
 * answers all of it, per client, instead of another guess.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const shareHost = await localDominatorShareHost()
  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { id: true, businessName: true, rankTrackingId: true, rankMapUrl: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  const rows = []
  for (const client of clients) {
    const detail = await campaignDetail(client.rankTrackingId as string)
    const wanted = whiteLabelEmbedUrl(detail.campaignLink, shareHost)
    // Diagnose AND fix in one press. Storing is idempotent and costs no
    // credits, and a check that reports a fixable problem without fixing it
    // is just another round trip.
    if (wanted && wanted !== client.rankMapUrl) {
      await prisma.client
        .update({ where: { id: client.id }, data: { rankMapUrl: wanted } })
        .catch(() => {})
    }
    rows.push({
      client: client.businessName,
      campaignId: client.rankTrackingId,
      httpStatus: detail.httpStatus,
      shareLinkKeys: detail.shareLinkKeys,
      runCount: detail.runCount,
      lastRunDate: detail.lastRunDate,
      apiError: detail.error,
      hasCampaignLink: !!detail.campaignLink,
      // The all-keywords URL we WOULD store, and the one currently stored.
      wanted,
      stored: wanted || client.rankMapUrl,
      updated: !!wanted && wanted !== client.rankMapUrl,
    })
    console.warn(
      `[RankCampaigns] map-status ${client.businessName}: campaign=${client.rankTrackingId} ` +
        `http=${detail.httpStatus} shareKeys=[${detail.shareLinkKeys.join(',')}] ` +
        `runs=${detail.runCount} lastRun=${detail.lastRunDate} err=${detail.error || 'none'} ` +
        `wanted=${wanted || 'none'}`
    )
  }

  // The three things that actually go wrong, named plainly.
  const problems: string[] = []
  if (!shareHost) {
    problems.push(
      'No share domain set — Settings → API keys → Rank report share domain. Nothing can be white-labelled until it is.'
    )
  }
  // Say WHICH failure it is. "No campaign_link" covering an HTTP error, an
  // unrun campaign and a genuinely absent field is three different fixes
  // wearing one message.
  const errored = rows.filter((r) => r.apiError)
  if (errored.length) {
    problems.push(
      `${errored.length} campaign(s) errored: ${errored
        .map((r) => `${r.client} — ${r.apiError}`)
        .join('; ')}`
    )
  }
  const missing = rows.filter((r) => !r.hasCampaignLink && !r.apiError)
  if (missing.length) {
    problems.push(
      `${missing.length} returned no campaign_link: ${missing
        .map(
          (r) =>
            `${r.client} (runs=${r.runCount ?? '?'}, lastRun=${r.lastRunDate || 'never'}, share_links=[${
              r.shareLinkKeys.join(',') || 'empty'
            }])`
        )
        .join('; ')}`
    )
  }
  const updated = rows.filter((r) => r.updated)

  return NextResponse.json({
    success: problems.length === 0,
    message:
      problems.length === 0
        ? `All ${rows.length} clients now embed their all-keywords map${
            updated.length ? ` (${updated.length} updated)` : ''
          }. Share domain: ${shareHost}.`
        : `${updated.length} updated · ${problems.join(' · ')}`,
    shareHost,
    rows,
  })
}
