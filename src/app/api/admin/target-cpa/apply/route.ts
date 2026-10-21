import { NextRequest, NextResponse } from 'next/server'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { applyTargetCpa } from '@/lib/target-cpa-apply'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/target-cpa/apply — Phase 2. On unless TARGET_CPA_APPLY_ENABLED=false.
 * Body: { customerId, campaignId, fromMicros, toMicros, scope }. Every check
 * that matters is in lib/target-cpa-apply.ts, against a live read.
 */
export async function POST(request: NextRequest) {
  const access = await requireTargetCpaApi()
  if ('denied' in access) return access.denied
  const body = await request.json().catch(() => null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  if (
    !body ||
    typeof body.customerId !== 'string' ||
    typeof body.campaignId !== 'string' ||
    num(body.toMicros) == null ||
    (body.scope !== 'campaign' && body.scope !== 'portfolio')
  ) {
    return NextResponse.json({ ok: false, status: 'refused', error: 'Bad request.' }, { status: 400 })
  }
  const result = await applyTargetCpa(access.email, {
    customerId: body.customerId,
    campaignId: body.campaignId,
    fromMicros: num(body.fromMicros),
    toMicros: num(body.toMicros) as number,
    scope: body.scope,
  })
  const status = result.ok ? 200 : result.status === 'disabled' ? 403 : result.status === 'refused' ? 409 : 502
  return NextResponse.json(result, { status })
}
