export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import IntakesManager from '@/components/admin/IntakesManager'

/**
 * Onboarding: send a shop the form, read what comes back, approve it.
 *
 * Its own page rather than a tab on a client, because half of these have no
 * client to be a tab on yet.
 */
export default async function Page() {
  await requireAdminPage()

  const clients = await prisma.client
    .findMany({
      where: { status: { in: ['ACTIVE', 'ONBOARDING'] } },
      select: { id: true, businessName: true, email: true, seoClient: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
      <p className="text-sm text-gray-500 mt-1">
        The welcome email, the form behind it, and what a shop sends back
      </p>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm mt-5">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Invites</h2>
          <p className="text-sm text-gray-500">
            Nothing a shop types goes live until you approve it
          </p>
        </div>
        <IntakesManager clients={clients} />
      </section>
    </div>
  )
}
