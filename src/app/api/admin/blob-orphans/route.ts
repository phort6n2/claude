import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { scanOrphans, sweepOrphans } from '@/lib/blob-orphans'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET — find files nothing points at. Read-only. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json(await scanOrphans())
}

/**
 * POST — delete an explicit list of them.
 *
 * The URLs are required rather than optional. A "delete everything you just
 * found" endpoint would re-run the scan server-side and delete a set nobody
 * looked at; naming the files means what is deleted is what was reviewed.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === 'string') : []
  if (urls.length === 0) {
    return NextResponse.json({ error: 'No files given to delete.' }, { status: 400 })
  }

  const result = await sweepOrphans(urls)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
