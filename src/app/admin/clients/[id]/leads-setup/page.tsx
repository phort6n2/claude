export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientLeadsForm from '@/components/forms/ClientLeadsForm'
import { requireAdminPage } from '@/lib/admin-guard'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return <ClientLeadsForm client={client as never} />
}
