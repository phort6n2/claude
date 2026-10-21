import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runBudgetPacing } from '@/lib/budget-pacing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/budget-pacing (every morning, after the ads sweep)
 *
 * Pushes and emails the campaigns that are newly not spending their budget.
 * See lib/budget-pacing.ts. `?dryRun=1` — open to a signed-in admin too, so
 * it can be tried from a browser — reports what it WOULD send and sends and
 * stores nothing.
 */
async function handle(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`
  if (!isCron) {
    // Only the scheduler SENDS. A signed-in admin may run the dry run.
    const session = dryRun ? await auth() : null
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runBudgetPacing({ dryRun })
  console.log(
    `[BudgetPacing] ${result.ok ? `${result.underspending.length} under-spending, ${result.new.length} new${dryRun ? ' (dry run)' : ''}${result.push ? `, push ${result.push.sent}/${result.push.sent + result.push.failed}` : ''}${result.email ? `, email ${result.email.sent ? 'sent' : `not sent (${result.email.error})`}` : ''}` : `failed: ${result.error}`}`
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
