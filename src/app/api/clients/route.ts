import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { generateSlug } from '@/lib/utils'
import { encrypt } from '@/lib/encryption'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clients = await withRetry(() =>
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
      })
    )
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Failed to fetch clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Generate slug from business name
    const slug = generateSlug(data.businessName)

    // Check if slug already exists
    const existing = await prisma.client.findUnique({
      where: { slug },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A client with this name already exists' },
        { status: 400 }
      )
    }

    // Encrypt WordPress password if provided
    let encryptedPassword = null
    if (data.wordpressAppPassword) {
      encryptedPassword = encrypt(data.wordpressAppPassword)
    }

    const client = await prisma.client.create({
      data: {
        slug,
        businessName: data.businessName,
        contactPerson: data.contactPerson || null,
        phone: data.phone,
        email: data.email,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        googlePlaceId: data.googlePlaceId || null,
        googleMapsUrl: data.googleMapsUrl || null,
        wrhqDirectoryUrl: data.wrhqDirectoryUrl || null,
        hasShopLocation: data.hasShopLocation ?? true,
        offersMobileService: data.offersMobileService ?? false,
        offersWindshieldRepair: data.offersWindshieldRepair ?? true,
        offersWindshieldReplacement: data.offersWindshieldReplacement ?? true,
        offersSideWindowRepair: data.offersSideWindowRepair ?? false,
        offersBackWindowRepair: data.offersBackWindowRepair ?? false,
        offersSunroofRepair: data.offersSunroofRepair ?? false,
        offersRockChipRepair: data.offersRockChipRepair ?? true,
        offersAdasCalibration: data.offersAdasCalibration ?? false,
        serviceAreas: data.serviceAreas || [],
        logoUrl: data.logoUrl || null,
        primaryColor: data.primaryColor || '#1e40af',
        secondaryColor: data.secondaryColor || '#3b82f6',
        accentColor: data.accentColor || '#f59e0b',
        brandVoice: data.brandVoice || 'Professional, helpful, and knowledgeable',
        wordpressUrl: data.wordpressUrl || null,
        wordpressUsername: data.wordpressUsername || null,
        wordpressAppPassword: encryptedPassword,
        wordpressConnected: false,
        ctaText: data.ctaText || 'Get a Free Quote',
        ctaUrl: data.ctaUrl || null,
        creatifyTemplateId: data.creatifyTemplateId || null,
        preferredPublishTime: data.preferredPublishTime || '09:00',
        timezone: data.timezone || 'America/Denver',
        socialPlatforms: data.socialPlatforms || [],
        socialAccountIds: data.socialAccountIds || null,
        podbeanPodcastId: data.podbeanPodcastId || null,
        podbeanPodcastTitle: data.podbeanPodcastTitle || null,
        podbeanPodcastUrl: data.podbeanPodcastUrl || null,
        wrhqYoutubePlaylistId: data.wrhqYoutubePlaylistId || null,
        wrhqYoutubePlaylistTitle: data.wrhqYoutubePlaylistTitle || null,
        status: 'ACTIVE',
      },
    })

    // Assign a publishing schedule slot to the new client (use dynamic import to avoid circular deps)
    try {
      const { assignSlotToClient } = await import('@/lib/automation/auto-scheduler')
      await assignSlotToClient(client.id)
      console.log(`[Client API] Assigned schedule slot to client ${client.id}`)
    } catch (scheduleError) {
      console.error(`[Client API] Failed to assign schedule slot:`, scheduleError)
      // Non-fatal - client is still created
    }

    // Sync standard PAAs to the new client (use dynamic import to avoid circular deps)
    try {
      const { syncStandardPAAsToClient } = await import('@/lib/automation/paa-selector')
      const syncedCount = await syncStandardPAAsToClient(client.id)
      console.log(`[Client API] Synced ${syncedCount} standard PAAs to client ${client.id}`)
    } catch (paaError) {
      console.error(`[Client API] Failed to sync standard PAAs:`, paaError)
      // Non-fatal - client is still created
    }

    // Fetch the updated client with schedule info
    const updatedClient = await prisma.client.findUnique({
      where: { id: client.id },
    })

    return NextResponse.json(updatedClient, { status: 201 })
  } catch (error) {
    console.error('Failed to create client:', error)
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
