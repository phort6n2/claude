export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { clientIdFromShareToken } from '@/lib/rank-share-token'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'

/**
 * Public ranking report, reached by capability link.
 *
 * This is the sales artifact: a shop owner who is not yet a customer can be
 * sent their own map without an account. The token is the only credential
 * and grants exactly one client's ranking history — nothing else on the
 * account is reachable from here.
 *
 * Deliberately noindex: these links get texted around, and a client's
 * ranking report has no business turning up in search results.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function SharedRankingsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const clientId = clientIdFromShareToken(token)
  if (!clientId) notFound()

  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: {
        businessName: true,
        city: true,
        state: true,
        rankTrackingId: true,
        rankMapUrl: true,
      },
    })
    .catch(() => null)
  if (!client) notFound()

  const scans = await rankScansFor(clientId)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Local ranking report
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{client.businessName}</h1>
          <p className="text-gray-600">
            Where this business appears in Google&apos;s map results across {client.city}
            {client.state ? `, ${client.state}` : ''}.
          </p>
        </div>

        <RankReport
          scans={scans}
          mapUrl={client.rankMapUrl}
          campaignId={client.rankTrackingId}
        />

        <p className="pt-2 text-center text-xs text-gray-500">
          Measured with real searches from {scans[0]?.gridSize ? scans[0].gridSize ** 2 : 100} points
          around the business · <a href="https://glassleads.app" className="underline">GlassLeads</a>
        </p>
      </div>
    </div>
  )
}
