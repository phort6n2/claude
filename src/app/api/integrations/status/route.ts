import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { runIntegrationChecks } from '@/lib/integration-checks'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Live status for every outside service the platform depends on.
 *
 * One request runs them all. The previous version listed what was configured
 * and tested only on demand, one at a time, which meant the default view of
 * the page said "configured" for a key that had been revoked a month ago.
 * Configured and working are different claims and only one of them is worth
 * putting on a status page.
 *
 * Every probe is individually wrapped and timed out, so a hanging vendor
 * costs its own row rather than the whole screen.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const checks = await runIntegrationChecks()
  return NextResponse.json({
    checks,
    checkedAt: new Date().toISOString(),
    // Only failures that can actually cost a lead are worth a headline.
    criticalDown: checks.filter((c) => c.severity === 'critical' && c.configured && !c.ok).length,
  })
}
