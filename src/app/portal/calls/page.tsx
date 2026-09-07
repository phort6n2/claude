export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getCallInsight } from '@/lib/call-patterns'
import CallInsightView from '@/components/portal/CallInsight'

/**
 * "Your phone" — missed calls, and when the phone actually rings.
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

  return <CallInsightView insight={insight} />
}
