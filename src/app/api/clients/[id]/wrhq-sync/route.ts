import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import { syncClientToWrhq, wrhqSyncEnabled, WRHQ_SYNC_SELECT } from '@/lib/wrhq-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Push ONE client to the Windshield Repair HQ directory, on demand.
 *
 * WHY A BUTTON EXISTS AT ALL. Creating a client, approving an intake and
 * editing the Business tab all sync on their own, and that covers the normal
 * life of a listing. What it does not cover is the day the directory was down
 * when one of those happened — and the recovery for that was "re-sync every
 * client", which is a heavy, slow answer to a problem with one shop in it.
 *
 * `dryRun` asks the directory what it WOULD do without writing anything: the
 * useful question is whether this shop is already one of the ~3,000 listings
 * or would get a new page, and finding that out should not create the page.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  if (!wrhqSyncEnabled()) {
    return NextResponse.json(
      {
        error:
          'WRHQ_SYNC_URL and WRHQ_SYNC_SECRET are not both set, so nothing would be sent.',
      },
      { status: 503 }
    )
  }

  const client = await prisma.client
    .findUnique({ where: { id }, select: WRHQ_SYNC_SELECT })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun === true
  const result = await syncClientToWrhq(client, { dryRun })

  /* A FAILED SYNC IS A 200 WITH A REASON, not a 500. The card is the place
     this is read, and it needs to say "the directory refused because X" — a
     bare status code turns into "Failed to fetch" in front of an operator who
     then has nothing to act on. */
  return NextResponse.json({ ...result, dryRun })
}
