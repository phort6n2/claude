export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientSiteForm from '@/components/forms/ClientSiteForm'
import { requireAdminPage } from '@/lib/admin-guard'
import UrlParityCard from '@/components/admin/UrlParityCard'
import SitePagesCard from '@/components/admin/SitePagesCard'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return (
    <div className="space-y-4">
      <ClientSiteForm client={client as never} />

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-3">
          <h2 className="font-semibold text-gray-900">Pages on this site</h2>
          <p className="text-sm text-gray-500">
            The sitemap this site hands search engines, read from the file itself — plus the
            pages it serves but deliberately keeps out of it
          </p>
        </div>
        <SitePagesCard clientId={client.id} />
      </section>

      {/* Only useful for a shop that still has a site to replace, so it does
          not sit on every client asking to be filled in. */}
      {client.websiteUrl && (
        <UrlParityCard clientId={client.id} defaultUrl={client.websiteUrl} />
      )}
    </div>
  )
}
