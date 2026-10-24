import { NextRequest, NextResponse } from 'next/server'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { ownerAdd } from '@/lib/bad-lead-run'
import { findSharedList, readNegatives } from '@/lib/negative-keywords'
import { shopFor } from '@/lib/bad-lead-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The owner adds a negative: a queued suggestion, or one he typed. Every check
 * in `negativeProblems` runs; a problem comes back as a 409 with the list,
 * and the panel asks before sending it again with `override: true`. A
 * duplicate is never overridden — there is nothing to add.
 */
export async function POST(req: NextRequest) {
  const gate = await requireTargetCpaApi()
  if ('denied' in gate) return gate.denied
  const b = await req.json().catch(() => ({}))
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  const matchType = b.matchType === 'EXACT' ? 'EXACT' : b.matchType === 'BROAD' ? 'BROAD' : 'PHRASE'
  const level = b.level === 'ad_group' ? 'ad_group' : b.level === 'shared_list' ? 'shared_list' : 'campaign'
  if (!text || typeof b.clientId !== 'string') return NextResponse.json({ error: 'Missing the keyword or the client.' }, { status: 400 })

  let list = null
  if (level === 'shared_list') {
    const listId = String(b.listId || '')
    if (!listId) return NextResponse.json({ error: 'Choose a list.' }, { status: 400 })
    const shared = await findSharedList()
    if (shared?.id === listId) list = shared
    else {
      // A list must be one the campaign actually uses — never an id from the page.
      const ctx = await shopFor(b.clientId)
      if (!ctx?.customerId || !b.campaignId) return NextResponse.json({ error: 'Unknown list.' }, { status: 400 })
      const attached = await readNegatives(ctx.customerId, String(b.campaignId), null)
      list = attached.lists.find((l) => l.id === listId) || null
      if (!list) return NextResponse.json({ error: 'That list is not attached to this campaign.' }, { status: 400 })
    }
  }

  const res = await ownerAdd({
    markId: typeof b.markId === 'string' ? b.markId : null,
    clientId: b.clientId,
    text,
    matchType,
    level,
    campaignId: b.campaignId ? String(b.campaignId) : null,
    adGroupId: b.adGroupId ? String(b.adGroupId) : null,
    list,
    fromTerm: typeof b.fromTerm === 'string' ? b.fromTerm : null,
    override: b.override === true,
    userEmail: gate.email,
  })
  if (res.ok) return NextResponse.json(res)
  const code = res.status === 'problems' ? 409 : res.status === 'duplicate' ? 409 : 502
  return NextResponse.json(res, { status: code })
}
