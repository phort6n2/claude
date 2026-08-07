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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto p-6">
        <ClientEditForm client={client} />
      </div>
    </div>
  )
}
