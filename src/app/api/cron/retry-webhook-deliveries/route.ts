import { NextRequest, NextResponse } from 'next/server'
import { retryPendingDeliveries } from '@/lib/webhook-forwarding'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/retry-webhook-deliveries
 *
 * Retries outbound webhook deliveries that are FAILED, or still PENDING
 * because the initial attempt never ran (function frozen, deploy raced).
 * Deliveries under the attempt cap and less than 24h old are retried oldest
 * first; anything past the cap or the window stays FAILED as a record.
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && !cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await retryPendingDeliveries()
    return NextResponse.json(result)
  } catch (error) {
    // Tables may not exist yet if the code deployed before the SQL ran.
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Cron] retry-webhook-deliveries failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
