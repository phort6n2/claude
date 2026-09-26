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
 * A TAB NOW ("Calls"), not only a home-screen tile. It was tile-only on the
 * grounds that the bar was full — and when the call-quality chart shipped
 * here, the owner's first question was where to find it. The bar became four
 * tabs and "More" (see PortalNav) partly so this page could have a place in
 * it. Missed calls still get a banner on the home screen, because they are
 * urgent: the banner is where they are discovered, this page is where they
 * are worked through.
 */
export default async function PortalCallsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const insight = await getCallInsight(session.clientId).catch(() => null)

  // How well the calls are HANDLED, beside when they come in and which were
  // missed — the one page about the phone.
  return <CallInsightView insight={insight} after={<CallQualityTrend />} />
}
