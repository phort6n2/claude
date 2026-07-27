import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { sendTestLeadEvent } from '@/lib/directory/webhooks'

// Fires one clearly-marked test event at AGMP_WEBHOOK_URL and returns the
// receiver's real answer, so a mistyped URL surfaces here instead of failing
// silently on the next genuine claim. Admin-only — this posts to an external
// endpoint, so it must not be publicly triggerable.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sendTestLeadEvent()
  return NextResponse.json(result)
}
