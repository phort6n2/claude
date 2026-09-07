export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import SeoTab from '@/components/admin/SeoTab'
import TrafficReport from '@/components/portal/TrafficReport'
import { getSiteAnalytics, rangeFrom, siteLabelFrom } from '@/lib/site-analytics'

/**
 * "SEO" tab: what this shop is paying for, and what that changes.
 *
 * The plan switch is the top of it, and it is also the gate: ticking it on is
 * the moment their content feed is wanted, so that card appears underneath it
 * rather than on every client.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string }>
}) {
  await requireAdminPage()

  const { id } = await params
  const range = rangeFrom((await searchParams).range)
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      seoClient: true,
      contentFeedUrl: true,
      contentFeedCheckedAt: true,
      contentFeedError: true,
      ga4PropertyId: true,
      searchConsoleSiteUrl: true,
      // Newest of any range: the card is reporting "when did we last hear
      // from Google", not the state of one particular window.
      trafficSnapshots: {
        select: { fetchedAt: true, error: true },
        orderBy: { fetchedAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!client) notFound()

  const feedItemCount = await prisma.siteFeedItem.count({ where: { clientId: id } }).catch(() => 0)

  /* THE REPORT ITSELF, HERE, not only in the client's portal.
     It was portal-only, so the only way for an operator to see what a shop had
     been sent was to impersonate them — which is a read-only look around,
     several clicks away, and an absurd amount of ceremony for "did the numbers
     arrive". The same component renders in both places, so what is checked
     here is exactly what the shop sees, the way the Rankings and Results tabs
     already work. */
  const connected = !!(client.ga4PropertyId || client.searchConsoleSiteUrl)
  const analytics = connected
    ? await getSiteAnalytics(id, range).catch(() => ({
        traffic: null,
        search: null,
        fetchedAt: null,
        oldestFetchedAt: null,
        error: 'Could not read the numbers',
      }))
    : null

  return (
    <div className="space-y-4">
    <SeoTab
      clientId={client.id}
      initialSeoClient={client.seoClient}
      feed={{
        url: client.contentFeedUrl,
        checkedAt: client.contentFeedCheckedAt?.toISOString() || null,
        error: client.contentFeedError,
        itemCount: feedItemCount,
      }}
      analytics={{
        propertyId: client.ga4PropertyId,
        siteUrl: client.searchConsoleSiteUrl,
        fetchedAt: client.trafficSnapshots[0]?.fetchedAt?.toISOString() || null,
        error: client.trafficSnapshots[0]?.error || null,
      }}
    />

      {analytics && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-4">
            Exactly what this shop sees on their own Traffic page.
          </p>
          <TrafficReport
            siteUrl={siteLabelFrom(client.searchConsoleSiteUrl)}
            range={range}
            traffic={analytics.traffic}
            search={analytics.search}
            fetchedAt={analytics.oldestFetchedAt ?? analytics.fetchedAt}
            error={analytics.error}
            showPortalLink={false}
          />
        </section>
      )}
    </div>
  )
}
