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

    // One line per run, whether or not the rows parsed. Gating this on
    // failure meant the average_rank shortcut skipped it, and the per-point
    // percentages still cannot be computed without it.
    //
    // `check` is the assertion that settled how a cell should be read: the
    // provider's own average_rank is the mean of every raw cell, so if these
    // two ever stop matching, the payload's meaning has changed and the +1 in
    // ranksFromContent needs re-deriving rather than trusting.
    if (!loggedShape) {
      loggedShape = true
      const content = (record as Record<string, unknown>).content
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
      const flat = matrix.flat().filter((v): v is number => typeof v === 'number')
      const rawMean = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null
      console.warn(
        '[LocalRank] grid',
        JSON.stringify({
          keyword: meta.keyword,
          rows: matrix.length,
          cols: matrix[0]?.length ?? 0,
          distinctRaw: [...new Set(flat)].sort((a, b) => a - b).slice(0, 25),
          providerAverageRank: meta.averageRank,
          rawMean: rawMean === null ? null : Math.round(rawMean * 100) / 100,
          check:
            rawMean !== null && meta.averageRank !== null
              ? Math.abs(rawMean - meta.averageRank) < 0.02
                ? 'raw mean matches their average — cells are 0-indexed positions'
                : 'MISMATCH — re-derive how a cell should be read'
              : 'not comparable',
          shareUrl: meta.shareUrl,
        })
      )
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
