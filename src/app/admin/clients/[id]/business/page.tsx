export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientBusinessForm from '@/components/forms/ClientBusinessForm'
import { requireAdminPage } from '@/lib/admin-guard'
import DeleteClientCard from '@/components/admin/DeleteClientCard'
import ClientStatusCard from '@/components/admin/ClientStatusCard'
import SocialLinksCard from '@/components/admin/SocialLinksCard'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return (
    <div className="space-y-6">
      <ClientBusinessForm client={client as never} />
      {/* Here rather than on the Website tab, because they are not website
          content — they never render on the hosted site. They are a fact about
          the business that travels to the directory listing, which is what the
          rest of this tab is. */}
      <SocialLinksCard clientId={client.id} initial={client.socialLinks} />
      {/* On the tab that owns the client's identity, because that is what it
          is — not a setting. Above delete and below the details, so the two
          irreversible-feeling controls sit together at the bottom. */}
      <ClientStatusCard clientId={client.id} initialStatus={client.status} />
      {/* Last thing on the tab that owns the client's identity, and the only
          place it appears. A delete control on a screen you visit daily is one
          you eventually hit by accident. */}
      <DeleteClientCard clientId={client.id} />
    </div>
  )
}
