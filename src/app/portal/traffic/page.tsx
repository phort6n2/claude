export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'
import { getSiteAnalytics, rangeFrom, siteLabelFrom } from '@/lib/site-analytics'
import TrafficReport, { TrafficUpsell } from '@/components/portal/TrafficReport'

/**
 * "How people find you" — the shop's own website in Google Analytics and
 * Search Console.
 *
 * NOT A TAB, and that is deliberate rather than an oversight. The phone tab
 * bar already carries five, and the comment in PortalNav records what a sixth
 * does to a 360px screen. This is reached from a tile on the home screen, the
 * same way Results is.
 *
 * WHICH STATE RENDERS is decided by the DATA, not by the plan flag. A shop
 * whose property is connected sees their numbers whether or not the SEO box
 * is ticked — the association is the operator saying "these numbers belong to
 * this client", and hiding them behind a second switch is one more thing to
 * forget. Everyone else gets the case for buying it.
 */
export default async function PortalTrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  // Anything unrecognised falls back to the default rather than erroring: the
  // range lives in the URL, and a URL can be edited or truncated by anything.
  const range = rangeFrom((await searchParams).range)

  const client = await prisma.client
    .findUnique({
      where: { id: session.clientId },
      select: { ga4PropertyId: true, searchConsoleSiteUrl: true },
    })
    .catch(() => null)

  const connected = !!(client?.ga4PropertyId || client?.searchConsoleSiteUrl)
  if (!connected) return <TrafficUpsell businessName={session.businessName} />

  // Never allowed to fail the page: a Google outage degrades to whatever was
  // last stored, with a line saying it stopped updating.
  const analytics = await getSiteAnalytics(session.clientId, range).catch(() => ({
    traffic: null,
    search: null,
    fetchedAt: null,
    error: 'Could not read the numbers',
  }))

  return (
    <TrafficReport
      siteUrl={siteLabelFrom(client?.searchConsoleSiteUrl)}
      range={range}
      traffic={analytics.traffic}
      search={analytics.search}
      fetchedAt={analytics.fetchedAt}
      error={analytics.error}
    />
  )
}
