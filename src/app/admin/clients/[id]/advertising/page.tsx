export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import AdsTrackingCard from '@/components/admin/AdsTrackingCard'
import ConversionStandardCard from '@/components/admin/ConversionStandardCard'
import LandingPagesCard from '@/components/admin/LandingPagesCard'
import AnalyticsCard from '@/components/admin/AnalyticsCard'
import { decrypt } from '@/lib/encryption'
import { requireAdminPage } from '@/lib/admin-guard'

/**
 * "Advertising" tab: everything the site reports back to an ad network.
 *
 * Split out from Website because it is a different job done by a different
 * person at a different time — the site goes live once, whereas conversion
 * tracking is set up per network, revisited whenever a campaign changes, and
 * carries its own step-by-step instructions.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      phone: true,
      clarityProjectId: true,
      clarityApiToken: true,
      adsTracking: { select: { ga4MeasurementId: true } },
    },
  })
  if (!client) notFound()

  const token = client.clarityApiToken ? decrypt(client.clarityApiToken) : null
  const maskedToken = token
    ? token.length <= 8
      ? '••••'
      : `${token.slice(0, 4)}••••${token.slice(-4)}`
    : null

  return (
    <div className="space-y-4">
      {/* Wrapped like its neighbour below. The tab used to open on an
          untitled, unbounded block of network tabs while the card under it got
          a proper heading. */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Tracking on the site</h2>
          <p className="text-sm text-gray-500">
            The tags this shop&apos;s site carries — what it reports to each ad network when a
            lead comes in, and what it records about how visitors use the pages
          </p>
        </div>
        <AdsTrackingCard
          clientId={client.id}
          clientPhone={client.phone}
          clarityProjectId={client.clarityProjectId}
          clarityMaskedToken={maskedToken}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Google Analytics</h2>
          <p className="text-sm text-gray-500">
            One GA4 property per shop, on the same tag the ads already load
          </p>
        </div>
        <AnalyticsCard
          clientId={client.id}
          measurementId={client.adsTracking?.ga4MeasurementId ?? null}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Conversion setup in Google Ads</h2>
          <p className="text-sm text-gray-500">
            The same four conversion actions, named the same way, in every client&apos;s account —
            checked against the live account
          </p>
        </div>
        <ConversionStandardCard clientId={client.id} />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Where the ads land</h2>
          <p className="text-sm text-gray-500">
            Every live ad, PMax asset group and sitelink must point at this client&apos;s hosted
            site — their subdomain or their own domain. A click landing anywhere else spends the
            same money with none of the tracking.
          </p>
        </div>
        <LandingPagesCard clientId={client.id} />
      </section>
    </div>
  )
}
