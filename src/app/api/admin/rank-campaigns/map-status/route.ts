import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { campaignShareLinks, localDominatorShareHost } from '@/lib/local-dominator'
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
    const links = await campaignShareLinks(client.rankTrackingId as string)
    const wanted = whiteLabelEmbedUrl(links?.campaignLink, shareHost)
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
      hasCampaignLink: !!links?.campaignLink,
      // The all-keywords URL we WOULD store, and the one currently stored.
      wanted,
      stored: wanted || client.rankMapUrl,
      updated: !!wanted && wanted !== client.rankMapUrl,
    })
    console.warn(
      `[RankCampaigns] map-status ${client.businessName}: campaignLink=${!!links?.campaignLink} ` +
        `wanted=${wanted || 'none'} stored=${client.rankMapUrl || 'none'}`
    )
  }

  // The three things that actually go wrong, named plainly.
  const problems: string[] = []
  if (!shareHost) {
    problems.push(
      'No share domain set — Settings → API keys → Rank report share domain. Nothing can be white-labelled until it is.'
    )
  }
  const missing = rows.filter((r) => !r.hasCampaignLink)
  if (missing.length) {
    problems.push(
      `${missing.length} campaign(s) have no campaign_link from Local Dominator yet (${missing
        .map((r) => r.client)
        .join(', ')}) — those fall back to per-keyword tabs.`
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
