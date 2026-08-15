import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Describe a value's SHAPE without dumping a megabyte of grid. */
function shapeOf(value: unknown, depth = 0): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return {
      __array: value.length,
      first: depth < 3 && value.length ? shapeOf(value[0], depth + 1) : '…',
    }
  }
  if (typeof value === 'object') {
    if (depth >= 3) return '{…}'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shapeOf(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string') return value.length > 40 ? `string(${value.length})` : value
  return typeof value
}

/**
 * GET — what a stored scan payload actually looks like.
 *
 * The parser reads the grid out of the provider's payload, and a payload
 * shaped differently from the documented one produces empty numbers rather
 * than an error. This shows the real structure so the reader can be fixed
 * against fact instead of assumption, without dumping the whole grid.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const scans = await prisma.localRankScan
    .findMany({
      orderBy: { scannedAt: 'desc' },
      take: 3,
      select: {
        searchTerm: true,
        scannedAt: true,
        averageRank: true,
        foundPercent: true,
        gridSize: true,
        raw: true,
        client: { select: { businessName: true, googlePlaceId: true } },
      },
    })
    .catch(() => [])

  return NextResponse.json({
    count: scans.length,
    scans: scans.map((s) => ({
      client: s.client.businessName,
      clientPlaceId: s.client.googlePlaceId,
      searchTerm: s.searchTerm,
      scannedAt: s.scannedAt,
      storedAverageRank: s.averageRank,
      storedFoundPercent: s.foundPercent,
      storedGridSize: s.gridSize,
      rawShape: shapeOf(s.raw),
    })),
  })
}
