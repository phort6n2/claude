export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getCallInsight } from '@/lib/call-patterns'
import CallInsightView from '@/components/portal/CallInsight'
import { CallQualityTrend } from '@/components/portal/CallQualityTrend'

/**
 * "Your phone" — missed calls, when the phone actually rings, and whether the
 * team is getting better at answering it.
 *
 * Reached from a home-screen tile rather than a tab: the phone tab bar is
 * measured full at six (see PortalNav), and a seventh would clip "Rankings"
 * at 320px. Missed calls are urgent enough that the home screen also carries
 * a banner when any are outstanding — the page is where they are worked
 * through, not where they are discovered.
 */
export default async function PortalCallsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const insight = await getCallInsight(session.clientId).catch(() => null)

  // How well the calls are HANDLED, beside when they come in and which were
  // missed — the one page about the phone.
  return <CallInsightView insight={insight} after={<CallQualityTrend />} />
}
