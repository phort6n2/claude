import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  summarizeGrid,
  searchTermOf,
  readScanRecord,
  type HeatmapRecord,
} from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
// A 10x10 grid across four keywords is a large body to parse and reduce.
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ clientId: string }>
}

/**
 * POST — a completed local-rank scan run from LocalDominator.
 *
 * Their scheduler runs the campaign and calls this when each run finishes,
 * so there is nothing to poll and no cron of ours involved. The payload
 * carries one heatmap record per keyword; each is reduced to this client's
 * numbers and stored as its own row, keyed on (runUuid, searchTerm) so a
 * redelivery updates rather than inventing an extra week in the trend.
 *
 * Authenticated by a per-client secret in the URL query rather than a
 * signature, because the provider posts a plain webhook with no signing
 * scheme documented. The secret is derived, never stored, and the raw
 * clientId alone is not enough to write anything.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { clientId } = await params
  const token = request.nextUrl.searchParams.get('t') || ''

  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: { id: true, googlePlaceId: true },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { rankWebhookToken } = await import('@/lib/local-rank-token')
  if (!rankWebhookToken.verify(clientId, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const runUuid = String(
    body.run_uuid || body.runUuid || body.scan_id || body.scanId || ''
  ).trim()
  if (!runUuid) {
    return NextResponse.json({ error: 'Missing run identifier' }, { status: 400 })
  }

  // Results may arrive as the array itself or wrapped under `results`.
  const raw = Array.isArray(body) ? body : body.results
  const records: HeatmapRecord[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (records.length === 0) {
    // A run that completed with nothing is not an error on our side; log it
    // and return 200 so the provider does not retry a payload we cannot use.
    console.warn(`[LocalRank] run ${runUuid} for ${clientId} carried no heatmap records`)
    return NextResponse.json({ ok: true, stored: 0 })
  }

  const placeId = client.googlePlaceId || ''
  let stored = 0

  for (const [i, record] of records.entries()) {
    // The delivered record carries far more than the documented shape: the
    // keyword, the shop's own place id, the geometry, and an average rank
    // Local Dominator has already worked out.
    const meta = readScanRecord(record)
    const term = meta.keyword || searchTermOf(record) || `keyword ${i + 1}`
    // Their place id beats ours: it is the business the scan was actually
    // run for, so a stale Place ID on our side cannot silently misread it.
    const subject = meta.placeId || placeId
    const summary = subject ? summarizeGrid(record, subject) : null

    try {
      const data = {
        clientId,
        runUuid,
        searchTerm: term,
        gridSize: meta.gridSize ?? 0,
        distance: meta.distance ?? Number(body.distance) ?? 0,
        // OUR average, not theirs. Their average_rank divides by every grid
        // point including the ones where the business does not appear, which
        // yields an area score below 1 — not a position any business holds.
        // Ours is the mean position across the points where they DO appear,
        // with absence reported separately as foundPercent.
        averageRank: summary?.averageRank ?? null,
        top3Percent: summary?.top3Percent ?? null,
        top10Percent: summary?.top10Percent ?? null,
        foundPercent: summary?.foundPercent ?? null,
        raw: record as unknown as object,
      }
      await prisma.localRankScan.upsert({
        where: { runUuid_searchTerm: { runUuid, searchTerm: term } },
        update: data,
        create: data,
      })
      stored++
    } catch (error) {
      console.error(`[LocalRank] failed to store ${runUuid}/${term}:`, error)
    }
  }

  console.log(`[LocalRank] ${clientId} run ${runUuid}: stored ${stored}/${records.length}`)
  return NextResponse.json({ ok: true, stored })
}
