import { NextRequest, NextResponse } from 'next/server'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { shopFor } from '@/lib/bad-lead-run'
import { findSharedList, readNegatives } from '@/lib/negative-keywords'

export const dynamic = 'force-dynamic'

/**
 * The negative lists a negative could go into: the ones attached to this
 * campaign (the client's own, like "Collision - Body Shop Exclusions"), and
 * the manager's shared AGMP list, which every client using it inherits.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTargetCpaApi()
  if ('denied' in gate) return gate.denied
  const clientId = req.nextUrl.searchParams.get('clientId') || ''
  const campaignId = req.nextUrl.searchParams.get('campaignId') || ''
  const ctx = await shopFor(clientId)
  if (!ctx?.customerId || !campaignId) return NextResponse.json({ lists: [] })
  const [attached, shared] = await Promise.all([readNegatives(ctx.customerId, campaignId, null), findSharedList()])
  const lists = attached.lists.map((l) => ({ ...l, shared: !!shared && l.id === shared.id }))
  if (shared && !lists.some((l) => l.id === shared.id)) lists.push({ ...shared, shared: true })
  return NextResponse.json({ lists, errors: attached.errors })
}
