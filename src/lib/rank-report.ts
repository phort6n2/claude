import { prisma } from '@/lib/db'
import type { RankScanRow } from '@/components/rank/RankReport'

/**
 * Every scan for a client, oldest first.
 *
 * Shared by the portal, the admin view and the public share link so all
 * three read exactly the same rows — the share link is only worth anything
 * if a prospect sees what the client sees.
 *
 * Defensive: a database without the table yet (a deploy where the bootstrap
 * SQL has not run) returns no scans rather than a 500.
 */
export async function rankScansFor(clientId: string): Promise<RankScanRow[]> {
  return prisma.localRankScan
    .findMany({
      where: { clientId },
      orderBy: { scannedAt: 'asc' },
      select: {
        id: true,
        searchTerm: true,
        scannedAt: true,
        averageRank: true,
        top3Percent: true,
        foundPercent: true,
        gridSize: true,
        distance: true,
        raw: true,
      },
    })
    .catch(() => [])
}

export interface ClientRankSummary {
  clientId: string
  businessName: string
  slug: string
  seoClient: boolean
  hasCampaign: boolean
  keyword: string | null
  averageRank: number | null
  top3Percent: number | null
  /** Change in average position since the first scan. Negative is better. */
  delta: number | null
  lastScanAt: Date | null
  scanCount: number
}

/**
 * One row per client for the overview.
 *
 * The headline keyword is the FIRST one configured rather than the best
 * performing: a table that silently shows each client's flattering keyword
 * is not a management tool, it is a comfort blanket.
 */
export async function rankSummaries(): Promise<ClientRankSummary[]> {
  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        businessName: true,
        slug: true,
        seoClient: true,
        rankTrackingId: true,
        rankKeywords: true,
      },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  const summaries: ClientRankSummary[] = []
  for (const client of clients) {
    const keyword = client.rankKeywords[0] || null
    const scans = keyword
      ? await prisma.localRankScan
          .findMany({
            where: { clientId: client.id, searchTerm: keyword },
            orderBy: { scannedAt: 'asc' },
            select: { averageRank: true, top3Percent: true, scannedAt: true },
          })
          .catch(() => [])
      : []

    const ranked = scans.filter((s) => typeof s.averageRank === 'number')
    const first = ranked[0]?.averageRank ?? null
    const last = ranked[ranked.length - 1]?.averageRank ?? null

    summaries.push({
      clientId: client.id,
      businessName: client.businessName,
      slug: client.slug,
      seoClient: client.seoClient,
      hasCampaign: !!client.rankTrackingId,
      keyword,
      averageRank: last,
      top3Percent: scans[scans.length - 1]?.top3Percent ?? null,
      delta: first !== null && last !== null && ranked.length >= 2 ? Math.round((last - first) * 10) / 10 : null,
      lastScanAt: scans[scans.length - 1]?.scannedAt ?? null,
      scanCount: scans.length,
    })
  }
  return summaries
}
