export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import ClientSiteForm from '@/components/forms/ClientSiteForm'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()
  return <ClientSiteForm client={client as never} />
}
