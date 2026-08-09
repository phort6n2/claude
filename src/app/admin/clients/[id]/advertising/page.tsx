export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import AdsTrackingCard from '@/components/admin/AdsTrackingCard'

/**
 * "Advertising" tab: everything the site reports back to an ad network.
 *
 * Split out from Website because it is a different job done by a different
 * person at a different time — the site goes live once, whereas conversion
 * tracking is set up per network, revisited whenever a campaign changes, and
 * carries its own step-by-step instructions.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, phone: true },
  })
  if (!client) notFound()

  return (
    <div className="space-y-4">
      <AdsTrackingCard clientId={client.id} clientPhone={client.phone} />
    </div>
  )
}
