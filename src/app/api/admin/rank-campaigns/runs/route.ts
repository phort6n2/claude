import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { campaignRuns } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Describe a value's SHAPE without dumping a 10x10 grid per keyword. */
function shapeOf(value: unknown, depth = 0): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return { __array: value.length, first: depth < 2 && value.length ? shapeOf(value[0], depth + 1) : '…' }
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '{…}'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = shapeOf(v, depth + 1)
    return out
  }
  if (typeof value === 'string') return value.length > 60 ? `string(${value.length})` : value
  return typeof value
}

/**
 * GET — the runs Local Dominator holds for a campaign, against the ones we
 * stored.
 *
 * Their campaign record carries a `runs` array, which the cadence audit
 * surfaced. That matters twice: it says whether a run we never received still
 * exists on their side, and it is the only route to recovering one. A missed
 * delivery is not necessarily lost data — credits are billed per run, so
 * re-scanning to recover a week is the expensive way to fix a reading
 * problem.
 *
 * Reads only, both sides. Shapes rather than contents, because a full run is
 * a hundred grid points per keyword and the question here is what is there.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const clientId = new URL(request.url).searchParams.get('clientId') || ''
  const client = clientId
    ? await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, businessName: true, rankTrackingId: true },
      })
    : await prisma.client.findFirst({
        where: { status: 'ACTIVE', rankTrackingId: { not: null }, seoClient: true },
        select: { id: true, businessName: true, rankTrackingId: true },
        orderBy: { businessName: 'asc' },
      })

  if (!client?.rankTrackingId) {
    return NextResponse.json({ error: 'No campaign for that client.' }, { status: 404 })
  }

  const runs = await campaignRuns(client.rankTrackingId)
  const stored = await prisma.localRankScan
    .findMany({
      where: { clientId: client.id },
      select: { runUuid: true, searchTerm: true, scannedAt: true },
      orderBy: { scannedAt: 'desc' },
    })
    .catch(() => [])

  const storedUuids = new Set(stored.map((s) => s.runUuid))

  return NextResponse.json({
    client: client.businessName,
    campaignId: client.rankTrackingId,
    theirRunCount: runs?.length ?? null,
    // The shape of one run, so a backfill can be written against fact rather
    // than against their documentation, which the webhook payload already
    // proved does not match what they send.
    runShape: runs?.length ? shapeOf(runs[0]) : null,
    theirRuns: (runs || []).map((run) => {
      const r = (run || {}) as Record<string, unknown>
      const id = String(r.id ?? r.run_uuid ?? r.uuid ?? '')
      return {
        id,
        date: r.date ?? r.run_date ?? r.created_at ?? null,
        weHaveIt: !!id && storedUuids.has(id),
        keys: Object.keys(r),
      }
    }),
    ourScans: stored.map((s) => ({
      runUuid: s.runUuid,
      searchTerm: s.searchTerm,
      scannedAt: s.scannedAt,
    })),
  })
}
