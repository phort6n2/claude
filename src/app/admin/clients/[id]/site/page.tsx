export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientSiteForm from '@/components/forms/ClientSiteForm'
import { requireAdminPage } from '@/lib/admin-guard'
import UrlParityCard from '@/components/admin/UrlParityCard'
import SitePagesCard from '@/components/admin/SitePagesCard'
import InsuranceProgramCard from '@/components/admin/InsuranceProgramCard'
import { siteOriginFor } from '@/lib/site-origin'
import { readProgramRecord, suggestedProgram } from '@/lib/insurance-programs'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    include: { domains: { where: { isPrimary: true }, take: 1 } },
  })
  if (!client) notFound()

  const program = readProgramRecord(
    await prisma.clientInsuranceProgram
      .findUnique({ where: { clientId: client.id } })
      .catch(() => null)
  )

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

      <InsuranceProgramCard
        clientId={client.id}
        siteUrl={siteOriginFor(client)}
        suggested={suggestedProgram(client.state).key}
        initial={
          program
            ? {
                ...program,
                publishedAt: program.publishedAt ? String(program.publishedAt) : null,
              }
            : null
        }
      />

      {/* Only useful for a shop that still has a site to replace, so it does
          not sit on every client asking to be filled in. */}
      {client.websiteUrl && (
        <UrlParityCard clientId={client.id} defaultUrl={client.websiteUrl} />
      )}
    </div>
  )
}
