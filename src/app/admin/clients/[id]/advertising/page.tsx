export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import AdsTrackingCard from '@/components/admin/AdsTrackingCard'
import OfflineConversionsCard from '@/components/admin/OfflineConversionsCard'
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
    select: { id: true, phone: true },
  })
  if (!client) notFound()

  return (
    <div className="space-y-4">
      <AdsTrackingCard clientId={client.id} clientPhone={client.phone} />

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Booked jobs back to Google</h2>
          <p className="text-sm text-gray-500">
            Upload what each job was worth, so bidding optimises for revenue rather than form
            fills
          </p>
        </div>
        <OfflineConversionsCard clientId={client.id} />
      </section>
    </div>
  )
}
