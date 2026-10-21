import { NextResponse } from 'next/server'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { runTargetCpaSnapshot } from '@/lib/target-cpa-fetch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** POST /api/admin/target-cpa/refresh — the panel's "Refresh now". Read-only against Google. */
export async function POST() {
  const access = await requireTargetCpaApi()
  if ('denied' in access) return access.denied
  const result = await runTargetCpaSnapshot('manual')
  console.log(
    result.ok
      ? `[TargetCpa] refresh by ${access.email}: ${result.accounts} accounts, ${result.campaigns} campaigns, ${result.errors.length} errors, ${result.durationMs}ms`
      : `[TargetCpa] refresh failed: ${result.error}`
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
