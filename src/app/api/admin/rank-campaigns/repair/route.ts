import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { summarizeGrid, locateHeatmap, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'

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
  let loggedShape = false

  for (const scan of scans) {
    const placeId = scan.client.googlePlaceId
    if (!placeId) {
      stillEmpty++
      continue
    }
    const record = (scan.raw || {}) as HeatmapRecord
    const meta = readScanRecord(record)

    // Log the grid's structure once per run, whether or not the row parsed.
    // Gating this on failure meant the average_rank shortcut skipped it, and
    // the per-point percentages still cannot be computed without it.
    if (!loggedShape) {
      loggedShape = true
      const content = (record as Record<string, unknown>).content
      const row = Array.isArray(content) ? content[0] : null
      const cellKey = row && typeof row === 'object' ? Object.keys(row)[0] : null
      const cell = row && typeof row === 'object' && cellKey !== null
        ? (row as Record<string, unknown>)[cellKey]
        : null
      // The whole matrix, as delivered. A hundred small integers is nothing
      // to log and it is the only way to settle what the values mean: a
      // geogrid centred on the shop must be best in the middle, so whichever
      // reading produces that is the correct one.
      const matrix = Array.isArray(content)
        ? content.map((r) =>
            Array.isArray(r)
              ? r
              : r && typeof r === 'object'
                ? Object.keys(r as object)
                    .filter((k) => /^\d+$/.test(k))
                    .sort((a, b) => Number(a) - Number(b))
                    .map((k) => (r as Record<string, unknown>)[k])
                : []
          )
        : []
      console.warn(
        '[LocalRank] matrix',
        JSON.stringify({
          keyword: meta.keyword,
          providerAverageRank: meta.averageRank,
          gridSize: meta.gridSize,
          rows: matrix.length,
          cols: matrix[0]?.length ?? 0,
          distinctValues: [...new Set(matrix.flat())].sort((a, b) => Number(a) - Number(b)).slice(0, 25),
        })
      )
      for (const [i, r] of matrix.entries()) {
        console.warn(`[LocalRank] row${String(i).padStart(2, '0')} ${JSON.stringify(r)}`)
      }
    }
    const summary = summarizeGrid(record, meta.placeId || placeId)

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
          ).slice(0, 700),
          '| contentCell=',
          (() => {
            const c = (record as Record<string, unknown>).content
            if (!Array.isArray(c) || !c.length) return 'none'
            const row = c[0] as Record<string, unknown>
            const cell = row && typeof row === 'object' ? row[Object.keys(row)[0]] : null
            return JSON.stringify({
              rowType: Array.isArray(row) ? 'array' : typeof row,
              rowKeys: row && typeof row === 'object' ? Object.keys(row).slice(0, 4) : null,
              cell: Array.isArray(cell)
                ? `array(${cell.length}) first=${JSON.stringify(cell[0])?.slice(0, 120)}`
                : cell && typeof cell === 'object'
                  ? `object{${Object.keys(cell).join('|')}}`
                  : typeof cell,
            }).slice(0, 500)
          })()
        )
      }
      stillEmpty++
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
