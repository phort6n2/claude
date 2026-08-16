export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { getClientActivity } from '@/lib/client-activity'
import ActivityFeed from '@/components/ActivityFeed'

/**
 * The SAME feed the client sees, on the admin side.
 *
 * Same component, same query — so what you read here before a renewal call is
 * exactly what they read. A separate admin version would drift, and the one
 * thing this artifact cannot afford is saying something different to the
 * person paying for it.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) notFound()

  const months = await getClientActivity(client.id)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Exactly what this client sees on their own Activity tab.
      </p>
      <ActivityFeed months={months} />
    </div>
  )
}
