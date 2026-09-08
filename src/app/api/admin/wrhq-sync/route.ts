import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import {
  syncClientToWrhq,
  wrhqSyncEnabled,
  WRHQ_SYNC_SELECT,
  type WrhqSyncResult,
} from '@/lib/wrhq-sync'

// ============================================
// BACKFILL / RECONCILE — every client → the directory
// ============================================
// Client creation and edits sync one at a time. This does the whole book:
//
//   • the backfill, for clients that existed before the sync did
//   • the repair, when a sync failed because the directory was down
//   • the reconcile, when someone edited a listing on the far side
//
// POST { dryRun: true } first. It reports what WOULD happen per client —
// crucially whether each one already exists in the directory or would be
// created — without writing anything. On ~3,000 existing listings most clients
// should MATCH rather than create, and a run that wants to create all of them
// means the matching is not seeing what it should.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Row {
  client: string
  city: string | null
  result: WrhqSyncResult & { wouldCreate?: boolean }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  if (!wrhqSyncEnabled()) {
    return NextResponse.json(
      {
        error:
          'WRHQ_SYNC_URL and WRHQ_SYNC_SECRET are not both set, so nothing would be sent.',
      },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun === true

  const clients = await prisma.client.findMany({
    select: WRHQ_SYNC_SELECT,
    orderBy: { businessName: 'asc' },
  })

  // Sequential on purpose. Fifteen clients is not worth the concurrency, and a
  // burst of parallel writes against the directory's Blob store is how you get
  // a partial run that is harder to reason about than a slow one.
  const rows: Row[] = []
  for (const client of clients) {
    const result = await syncClientToWrhq(client, { dryRun })
    rows.push({ client: client.businessName, city: client.city, result })
  }

  const failed = rows.filter((r) => !r.result.ok)
  return NextResponse.json({
    ok: failed.length === 0,
    dryRun,
    total: rows.length,
    succeeded: rows.length - failed.length,
    failed: failed.length,
    rows,
  })
}
