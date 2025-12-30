import { notFound } from 'next/navigation'
import Header from '@/components/admin/Header'
import ClientForm from '@/components/forms/ClientForm'
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
    <div className="flex flex-col h-full">
      <Header
        title={`Edit ${client.businessName}`}
        subtitle="Update client settings"
      />
      <div className="flex-1 p-6 overflow-auto">
        <ClientForm 
          initialData={{
            ...client,
            contactPerson: client.contactPerson ?? undefined,
            logoUrl: client.logoUrl ?? undefined,
            primaryColor: client.primaryColor ?? undefined,
            secondaryColor: client.secondaryColor ?? undefined,
            accentColor: client.accentColor ?? undefined,
            brandVoice: client.brandVoice ?? undefined,
            wordpressUrl: client.wordpressUrl ?? undefined,
            wordpressUsername: client.wordpressUsername ?? undefined,
            wordpressAppPassword: client.wordpressAppPassword ?? undefined,
            ctaUrl: client.ctaUrl ?? undefined,
            getlateAccountId: client.getlateAccountId ?? undefined,
            portalPassword: client.portalPassword ?? undefined,
            gbpPlaceId: client.gbpPlaceId ?? undefined,
            gbpRating: client.gbpRating ?? undefined,
            gbpReviewCount: client.gbpReviewCount ?? undefined,
          }} 
          isEditing 
        />
      </div>
    </div>
  )
}
