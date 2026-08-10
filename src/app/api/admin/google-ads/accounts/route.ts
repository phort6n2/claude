import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { listManagedAccounts } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * The client accounts under our manager account.
 *
 * Exists so the admin picks a client's Ads account from a list instead of
 * typing a ten-digit number. A transposed digit does not error — it points the
 * conversion check at a different advertiser's account, which either answers
 * "no such conversion" or, worse, finds a same-named action there.
 *
 * Never fails hard: no credentials configured is a normal state for a fresh
 * install, and the card degrades to "no account selected" rather than an error.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const result = await listManagedAccounts()
  if (!result.ok) return NextResponse.json({ accounts: [], error: result.error })
  return NextResponse.json({ accounts: result.accounts })
}
