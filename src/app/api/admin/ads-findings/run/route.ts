import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { runDailyAdsChecks, emailFindingsDigest } from '@/lib/google-ads-checks'
import { runWeeklyPlaybook } from '@/lib/google-ads-playbook'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — run the Google Ads checks right now, from the maintenance page or
 * the findings list. `{ cadence: "DAILY" | "WEEKLY" }` runs one sweep; no
 * body runs both, which is what "show me everything" means when a human
 * presses the button. Same runs as the crons, digest included.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const cadence = typeof body?.cadence === 'string' ? body.cadence.toUpperCase() : null

  const daily = cadence === null || cadence === 'DAILY' ? await runDailyAdsChecks() : null
  const weekly = cadence === null || cadence === 'WEEKLY' ? await runWeeklyPlaybook() : null

  const merged = {
    accounts: Math.max(daily?.accounts ?? 0, weekly?.accounts ?? 0),
    errors: [...(daily?.errors ?? []), ...(weekly?.errors ?? [])],
    newFindings: [...(daily?.newFindings ?? []), ...(weekly?.newFindings ?? [])],
    resolved: (daily?.resolved ?? 0) + (weekly?.resolved ?? 0),
    stillOpen: (daily?.stillOpen ?? 0) + (weekly?.stillOpen ?? 0),
    heldByCooldown: weekly?.heldByCooldown ?? [],
  }
  const digest = await emailFindingsDigest(merged)
  return NextResponse.json({ ...merged, digest })
}
