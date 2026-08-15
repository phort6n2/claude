import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { summarizeGrid, locateHeatmap, type HeatmapRecord } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — recompute every stored scan's summary from its raw payload.
 *
 * The raw provider payload is kept precisely so a reader bug costs nothing
 * but a recompute: no re-scan, no credits, no waiting a month for the next
 * run. Run this after changing how the grid is read.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const scans = await prisma.localRankScan
    .findMany({
      select: {
        id: true,
        raw: true,
        averageRank: true,
        client: { select: { googlePlaceId: true } },
      },
    })
    .catch(() => [])

  let repaired = 0
  let stillEmpty = 0
  let unchanged = 0

  for (const scan of scans) {
    const placeId = scan.client.googlePlaceId
    if (!placeId) {
      stillEmpty++
      continue
    }
    const record = (scan.raw || {}) as HeatmapRecord
    const summary = summarizeGrid(record, placeId)
    if (!summary) {
      // Log the SHAPE of the first payload we cannot read, so the reader can
      // be fixed against the real structure instead of a guess. Keys only —
      // a grid is far too large to log, and none of this is secret.
      if (stillEmpty === 0) {
        const located = locateHeatmap(record)
        console.warn(
          '[LocalRank] unreadable payload.',
          'topLevelKeys=', Object.keys(record).join(','),
          '| foundGrid=', !!located,
          '| nested=', JSON.stringify(
            Object.fromEntries(
              Object.entries(record).map(([k, v]) => [
                k,
                Array.isArray(v)
                  ? `array(${v.length})${v.length && typeof v[0] === 'object' && v[0] ? `[${Object.keys(v[0] as object).join('|')}]` : ''}`
                  : v && typeof v === 'object'
                    ? `object{${Object.keys(v as object).join('|')}}`
                    : typeof v,
              ])
            )
          ).slice(0, 900)
        )
      }
      stillEmpty++
      continue
    }
    if (scan.averageRank !== null) {
      unchanged++
      continue
    }
    await prisma.localRankScan
      .update({
        where: { id: scan.id },
        data: {
          averageRank: summary.averageRank,
          top3Percent: summary.top3Percent,
          top10Percent: summary.top10Percent,
          foundPercent: summary.foundPercent,
        },
      })
      .catch(() => {})
    repaired++
  }

  const parts = [`${repaired} recomputed`]
  if (unchanged) parts.push(`${unchanged} already had numbers`)
  if (stillEmpty) {
    parts.push(
      `${stillEmpty} still unreadable — the payload has no grid we can find, or the client has no Google Place ID`
    )
  }
  if (scans.length === 0) parts.push('no scans stored yet')

  return NextResponse.json({
    success: stillEmpty === 0,
    message: parts.join(' · '),
    total: scans.length,
    repaired,
    unchanged,
    stillEmpty,
  })
}
