export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import ClientEditForm from '@/components/forms/ClientEditForm'
import { prisma } from '@/lib/db'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditClientPage({ params }: PageProps) {
  const { id } = await params

  const client = await prisma.client.findUnique({
    where: { id },
  })

  if (!client) {
    notFound()
  }

  // Transform for the edit form - keep structure but handle nulls
  const clientData = {
    ...client,
    socialAccountIds: (client.socialAccountIds as Record<string, string>) || {},
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <ClientEditForm client={clientData} />
      </div>
    </div>
  )
}
