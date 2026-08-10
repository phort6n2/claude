export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientBusinessForm from '@/components/forms/ClientBusinessForm'
import { requireAdminPage } from '@/lib/admin-guard'
import DeleteClientCard from '@/components/admin/DeleteClientCard'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return (
    <div className="space-y-6">
      <ClientBusinessForm client={client as never} />
      {/* Last thing on the tab that owns the client's identity, and the only
          place it appears. A delete control on a screen you visit daily is one
          you eventually hit by accident. */}
      <DeleteClientCard clientId={client.id} />
    </div>
  )
}
