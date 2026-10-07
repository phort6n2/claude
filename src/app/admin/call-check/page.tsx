export const dynamic = 'force-dynamic'

import Header from '@/components/admin/Header'
import CallCheckBoard, { type CallCheckClient } from '@/components/admin/CallCheckBoard'
import { requireAdminPage } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { LIVE_STATUSES } from '@/lib/site-preview'

/**
 * "Are people calling less, or is Google counting less?" — per shop.
 *
 * DB-only on load, like Conversion tracking: the Google side is fifteen
 * accounts of queries, so each row is checked on demand from the browser.
 * See lib/call-check.ts for what the comparison means.
 */
export default async function CallCheckPage() {
  await requireAdminPage()

  const clients = await prisma.client.findMany({
    where: {
      status: { in: [...LIVE_STATUSES] },
      OR: [{ adsTracking: { googleAdsCustomerId: { not: null } } }, { trackingNumbers: { some: {} } }],
    },
    select: {
      id: true,
      businessName: true,
      adsTracking: { select: { googleAdsCustomerId: true } },
      _count: { select: { trackingNumbers: true } },
    },
    orderBy: { businessName: 'asc' },
  })
  const rows: CallCheckClient[] = clients.map((c) => ({
    id: c.id,
    businessName: c.businessName,
    hasAdsAccount: !!c.adsTracking?.googleAdsCustomerId,
    trackingNumbers: c._count.trackingNumbers,
  }))

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Call check"
        subtitle="The calls our numbers recorded, against the calls Google saw and credited"
      />
      <div className="flex-1 p-4 sm:p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <CallCheckBoard clients={rows} />
      </div>
    </div>
  )
}
