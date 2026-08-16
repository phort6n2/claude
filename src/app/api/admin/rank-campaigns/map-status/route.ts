import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import {
  campaignDetail,
  campaignListEntry,
  localDominatorShareHost,
  shareTokenResolves,
} from '@/lib/local-dominator'
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
    let wanted = whiteLabelEmbedUrl(detail.campaignLink, shareHost)
    let source = wanted ? 'campaign_link' : 'none'

    // If they never issued a campaign_link, try the scheduled_scan_id itself
    // against the share host, which 404s for a token it does not know.
    if (!wanted && shareHost && client.rankTrackingId) {
      if (await shareTokenResolves(client.rankTrackingId, shareHost)) {
        wanted = `https://${shareHost}/${client.rankTrackingId}`
        source = 'scheduled_scan_id'
      }
    }

    // The list endpoint, last. Its items may carry share_links that the
    // detail response does not.
    let listKeys: string[] = []
    if (!wanted && client.rankTrackingId) {
      const entry = await campaignListEntry(client.rankTrackingId)
      listKeys = entry.shareLinkKeys
      const fromList = whiteLabelEmbedUrl(entry.campaignLink, shareHost)
      if (fromList) {
        wanted = fromList
        source = 'list endpoint'
      }
    }
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
      listShareLinkKeys: listKeys,
      source,
      // The all-keywords URL we WOULD store, and the one currently stored.
      wanted,
      stored: wanted || client.rankMapUrl,
      updated: !!wanted && wanted !== client.rankMapUrl,
    })
    console.warn(
      `[RankCampaigns] map-status ${client.businessName}: campaign=${client.rankTrackingId} ` +
        `http=${detail.httpStatus} shareKeys=[${detail.shareLinkKeys.join(',')}] ` +
        `runs=${detail.runCount} lastRun=${detail.lastRunDate} err=${detail.error || 'none'} ` +
        `source=${source} wanted=${wanted || 'none'}`
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
  const bySid = rows.filter((r) => r.source === 'scheduled_scan_id')
  if (bySid.length) {
    problems.push(
      `${bySid.length} resolved from the campaign id instead of campaign_link (${bySid
        .map((r) => r.client)
        .join(', ')}) — their share host accepted it, so those are correct.`
    )
  }
  const missing = rows.filter((r) => !r.wanted && !r.apiError)
  if (missing.length) {
    problems.push(
      `${missing.length} have no all-keywords map: ${missing
        .map(
          (r) =>
            `${r.client} (detail share_links=[${
              r.shareLinkKeys.join(',') || 'empty'
            }], list share_links=[${r.listShareLinkKeys.join(',') || 'empty'}])`
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
