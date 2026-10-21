import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isMasterLeadsEmail } from '@/lib/master-leads-access'

/**
 * Who may open the Target CPA panel: a signed-in admin AND the owner's own
 * address (`MASTER_LEADS_EMAIL`), the same one-address rule as Master Leads.
 * It reads every account under the manager and, with the flag on, changes a
 * live campaign's bidding — that is one person's job, not every admin login's.
 * Unset means nobody, which is the safe default for a screen that can spend.
 */
export async function targetCpaUser(): Promise<string | null> {
  const session = await auth()
  const email = session?.user?.email || null
  return session?.user && isMasterLeadsEmail(email) ? email : null
}

/** For an API route: the caller's email, or the response to send instead. */
export async function requireTargetCpaApi(): Promise<{ email: string } | { denied: NextResponse }> {
  const email = await targetCpaUser()
  if (!email) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { email }
}

/** For the page. Signed out goes to login; signed in as anyone else, to the dashboard. */
export async function requireTargetCpaPage(): Promise<string> {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const email = session.user.email || null
  if (!isMasterLeadsEmail(email)) redirect('/admin/dashboard')
  return email as string
}
