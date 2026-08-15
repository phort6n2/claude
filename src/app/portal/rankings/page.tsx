export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import { gridRanks, type HeatmapRecord } from '@/lib/local-dominator'
import RankHeatmap from '@/components/portal/RankHeatmap'
import RankTrend from '@/components/portal/RankTrend'

/**
 * "Local Rankings" in the client portal.
 *
 * What a shop owner wants to know is "is this working". So the page leads
 * with the most recent map and the direction of travel, not with a table of
 * numbers. Everything shown is measured — no projections, no scores we made
 * up, and no page at all until there is a real scan behind it.
 */

function relative(date: Date): string {
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export default async function PortalRankingsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { businessName: true, city: true, googlePlaceId: true },
  })

  const scans = await prisma.localRankScan
    .findMany({
      where: { clientId: session.clientId },
      orderBy: { scannedAt: 'asc' },
      select: {
        searchTerm: true,
        scannedAt: true,
        averageRank: true,
        top3Percent: true,
        foundPercent: true,
        raw: true,
      },
    })
    .catch(() => [])

  // Group by keyword, preserving chronological order within each.
  const byTerm = new Map<string, typeof scans>()
  for (const scan of scans) {
    const list = byTerm.get(scan.searchTerm) || []
    list.push(scan)
    byTerm.set(scan.searchTerm, list)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Local rankings</h1>
        <p className="text-gray-600">
          Where {client?.businessName || 'your shop'} shows up in Google&apos;s map results when
          someone searches from around {client?.city || 'your area'}.
        </p>
      </div>

      {byTerm.size === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900">No scans yet</h2>
          <p className="mt-1 text-sm text-gray-600 max-w-prose">
            Your first ranking scan hasn&apos;t run yet. Once it does, this page shows a map of
            where you appear around {client?.city || 'your area'}, and how that changes over time.
          </p>
        </div>
      ) : (
        [...byTerm.entries()].map(([term, list]) => {
          const latest = list[list.length - 1]
          const grid = gridRanks((latest.raw || {}) as HeatmapRecord, client?.googlePlaceId || '')
          return (
            <section key={term} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-900">
                  &ldquo;{term}&rdquo;
                </h2>
                <span className="text-xs text-gray-500">
                  Last checked {relative(latest.scannedAt)}
                </span>
              </div>

              <div className="mt-3 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                {grid.length > 0 && <RankHeatmap grid={grid} label={term} />}

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat
                      label="Average position"
                      value={latest.averageRank === null ? '—' : latest.averageRank.toFixed(1)}
                      hint={latest.averageRank === null ? 'not showing yet' : 'where you rank'}
                    />
                    <Stat
                      label="In the top 3"
                      value={latest.top3Percent === null ? '—' : `${Math.round(latest.top3Percent)}%`}
                      hint="of the area"
                    />
                    <Stat
                      label="Showing at all"
                      value={latest.foundPercent === null ? '—' : `${Math.round(latest.foundPercent)}%`}
                      hint="of the area"
                    />
                  </div>

                  {list.length >= 2 ? (
                    <RankTrend
                      points={list.map((s) => ({
                        date: s.scannedAt.toISOString(),
                        averageRank: s.averageRank,
                      }))}
                    />
                  ) : (
                    <p className="text-xs text-gray-500">
                      The trend line appears once there are two scans to compare.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xl font-extrabold text-gray-900 tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-gray-700 leading-tight">{label}</div>
      <div className="text-[11px] text-gray-500 leading-tight">{hint}</div>
    </div>
  )
}
