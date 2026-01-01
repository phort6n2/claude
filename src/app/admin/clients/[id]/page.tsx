export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Header from '@/components/admin/Header'
import ClientForm from '@/components/forms/ClientForm'
import { prisma } from '@/lib/db'
import type { Client } from '@prisma/client'

interface PageProps {
  params: Promise<{ id: string }>
}

// Transform null values to undefined for form compatibility
function transformClientForForm(client: Client) {
  return {
    id: client.id,
    businessName: client.businessName,
    contactPerson: client.contactPerson ?? '',
    phone: client.phone,
    email: client.email,
    streetAddress: client.streetAddress,
    city: client.city,
    state: client.state,
    postalCode: client.postalCode,
    googlePlaceId: client.googlePlaceId ?? '',
    googleMapsUrl: client.googleMapsUrl ?? '',
    wrhqDirectoryUrl: client.wrhqDirectoryUrl ?? '',
    hasShopLocation: client.hasShopLocation,
    offersMobileService: client.offersMobileService,
    hasAdasCalibration: client.hasAdasCalibration,
    serviceAreas: client.serviceAreas.join(', '),
    logoUrl: client.logoUrl ?? '',
    primaryColor: client.primaryColor ?? '#1e40af',
    secondaryColor: client.secondaryColor ?? '#3b82f6',
    accentColor: client.accentColor ?? '#f59e0b',
    brandVoice: client.brandVoice ?? 'Professional, helpful, and knowledgeable',
    wordpressUrl: client.wordpressUrl ?? '',
    wordpressUsername: client.wordpressUsername ?? '',
    wordpressAppPassword: '',
    ctaText: client.ctaText,
    ctaUrl: client.ctaUrl ?? '',
    preferredPublishTime: client.preferredPublishTime,
    timezone: client.timezone,
    postsPerWeek: client.postsPerWeek,
    socialPlatforms: client.socialPlatforms,
    socialAccountIds: (client.socialAccountIds as Record<string, string>) || {},
    podbeanPodcastId: client.podbeanPodcastId ?? '',
    podbeanPodcastTitle: client.podbeanPodcastTitle ?? '',
  }
}

export default async function EditClientPage({ params }: PageProps) {
  const { id } = await params

  const client = await prisma.client.findUnique({
    where: { id },
  })

  if (!client) {
    notFound()
  }

  const formData = transformClientForForm(client)

  return (
    <div className="flex flex-col h-full">
      <Header
        title={`Edit ${client.businessName}`}
        subtitle="Update client settings"
      />
      <div className="flex-1 p-6 overflow-auto">
        <ClientForm initialData={formData} isEditing />
      </div>
    </div>
  )
}
