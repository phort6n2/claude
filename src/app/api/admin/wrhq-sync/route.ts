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
export const maxDuration = 300

/**
 * Stop before the platform does.
 *
 * Sequential pushes with an 8-second timeout each means a slow directory eats
 * the function's whole allowance and gets KILLED mid-run — no response, no
 * report, and no way to tell which clients were done. A run that stops itself
 * and says "twelve done, three left" is a run somebody can act on, so this
 * leaves headroom to answer.
 */
const BUDGET_MS = (maxDuration - 20) * 1000

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

  /* Dry run from the BODY or the QUERY STRING. The Maintenance page's runner
     sends no body — it is a list of paths and methods — so a body-only flag
     made the safe half of this tool the one that could not be reached from the
     only screen that offers it. */
  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun === true || request.nextUrl.searchParams.has('dryRun')

  const clients = await prisma.client.findMany({
    select: WRHQ_SYNC_SELECT,
    orderBy: { businessName: 'asc' },
  })

  // Sequential on purpose. Fifteen clients is not worth the concurrency, and a
  // burst of parallel writes against the directory's Blob store is how you get
  // a partial run that is harder to reason about than a slow one.
  const startedAt = Date.now()
  const rows: Row[] = []
  const notReached: string[] = []
  for (const client of clients) {
    if (Date.now() - startedAt > BUDGET_MS) {
      notReached.push(client.businessName)
      continue
    }
    const result = await syncClientToWrhq(client, { dryRun })
    rows.push({ client: client.businessName, city: client.city, result })
  }

  const failed = rows.filter((r) => !r.result.ok)
  return NextResponse.json({
    // Ran out of time is not success, even when nothing failed: press it again.
    ok: failed.length === 0 && notReached.length === 0,
    dryRun,
    total: clients.length,
    attempted: rows.length,
    succeeded: rows.length - failed.length,
    failed: failed.length,
    ...(notReached.length
      ? {
          ranOutOfTime: true,
          notReached,
          note: 'Stopped short of the function time limit. Run it again — clients already synced are matched, not duplicated.',
        }
      : {}),
    rows,
  })
}
