export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientSiteForm from '@/components/forms/ClientSiteForm'
import { requireAdminPage } from '@/lib/admin-guard'
import UrlParityCard from '@/components/admin/UrlParityCard'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return (
    <div className="space-y-4">
      <ClientSiteForm client={client as never} />
      {/* Only useful for a shop that still has a site to replace, so it does
          not sit on every client asking to be filled in. */}
      {client.websiteUrl && (
        <UrlParityCard clientId={client.id} defaultUrl={client.websiteUrl} />
      )}
    </div>
  )
}
