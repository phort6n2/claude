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
/**
 * Record what arrived, whatever it was.
 *
 * A week of scans went missing and there was no way to tell "they never
 * posted" from "they posted something we could not read": both paths write a
 * console line, and runtime logs keep a day. By the time a flat chart is
 * noticed the evidence is gone.
 *
 * Never throws and never blocks the response — a logging table that can fail
 * a webhook is worse than no logging table.
 */
async function note(
  clientId: string,
  status: string,
  extra: { runUuid?: string | null; records?: number; detail?: string } = {}
) {
  try {
    await prisma.rankWebhookLog.create({
      data: {
        clientId,
        status,
        runUuid: extra.runUuid || null,
        records: extra.records ?? 0,
        detail: extra.detail?.slice(0, 500) || null,
      },
    })
  } catch {
    // Table may not exist yet on a fresh deploy; the delivery still counts.
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { clientId } = await params
  const token = request.nextUrl.searchParams.get('t') || ''

  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: { id: true, googlePlaceId: true },
    })
    .catch(() => null)
  if (!client) {
    await note(clientId, 'unknown-client')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { rankWebhookToken } = await import('@/lib/local-rank-token')
  if (!rankWebhookToken.verify(clientId, token)) {
    await note(clientId, 'unauthorized', { detail: token ? 'token did not verify' : 'no token in URL' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    await note(clientId, 'bad-json')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const runUuid = String(
    body.run_uuid || body.runUuid || body.scan_id || body.scanId || ''
  ).trim()
  if (!runUuid) {
    // The keys that WERE present, because the next time this happens the
    // question is which key their run id moved to.
    await note(clientId, 'no-run-id', { detail: `keys: ${Object.keys(body).join(', ')}` })
    return NextResponse.json({ error: 'Missing run identifier' }, { status: 400 })
  }

  // Results may arrive as the array itself or wrapped under `results`.
  const raw = Array.isArray(body) ? body : body.results
  const records: HeatmapRecord[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (records.length === 0) {
    // A run that completed with nothing is not an error on our side; log it
    // and return 200 so the provider does not retry a payload we cannot use.
    console.warn(`[LocalRank] run ${runUuid} for ${clientId} carried no heatmap records`)
    await note(clientId, 'no-records', { runUuid, detail: `keys: ${Object.keys(body).join(', ')}` })
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
        // OUR average, not theirs. Their `average_rank` is the mean of the
        // raw cells, which are zero-indexed — so it reads one whole position
        // better than reality ("1.13" for a grid that averages 2nd place).
        // Ours is the mean actual position across the points where the
        // business appears, with absence reported separately as foundPercent.
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
  await note(clientId, 'stored', { runUuid, records: stored, detail: `${stored} of ${records.length} records` })
  return NextResponse.json({ ok: true, stored })
}
