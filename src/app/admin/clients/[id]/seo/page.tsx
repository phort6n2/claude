export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import SeoTierCard from '@/components/admin/SeoTierCard'

/**
 * "SEO" tab: what this shop is paying for, and what that changes.
 *
 * One switch. It used to carry the syndicated-article cards too; that
 * integration is gone, and what is left is the thing the switch has always
 * really controlled — how often the rank campaign runs and how many keywords
 * it covers.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, seoClient: true },
  })
  if (!client) notFound()

  return (
    <div className="space-y-6">
      <SeoTierCard clientId={client.id} initialEnabled={client.seoClient} />
    </div>
  )
}
