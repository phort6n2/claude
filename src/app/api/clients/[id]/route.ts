import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            contentItems: true,
            blogPosts: true,
          },
        },
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Don't send encrypted password to frontend - just indicate if one exists
    const { wordpressAppPassword, ...clientWithoutPassword } = client
    return NextResponse.json({
      ...clientWithoutPassword,
      wordpressAppPassword: null, // Never send encrypted password to client
      hasWordPressPassword: !!wordpressAppPassword,
    })
  } catch (error) {
    console.error('Failed to fetch client:', error)
    return NextResponse.json(
      { error: 'Failed to fetch client' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const data = await request.json()

    const existing = await prisma.client.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Encrypt WordPress password if changed
    let encryptedPassword = existing.wordpressAppPassword
    const hasNewPassword = data.wordpressAppPassword && data.wordpressAppPassword !== ''
    console.log('[Client Update] Password handling:', {
      businessName: existing.businessName,
      hasNewPasswordFromForm: hasNewPassword,
      newPasswordLength: hasNewPassword ? data.wordpressAppPassword.length : 0,
      hasExistingPassword: !!existing.wordpressAppPassword,
      existingPasswordPrefix: existing.wordpressAppPassword?.substring(0, 10),
    })
    if (hasNewPassword) {
      encryptedPassword = encrypt(data.wordpressAppPassword)
      console.log('[Client Update] Encrypted new password:', {
        encryptedPrefix: encryptedPassword?.substring(0, 10),
        encryptedLength: encryptedPassword?.length,
      })
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        businessName: data.businessName,
        contactPerson: data.contactPerson || null,
        phone: data.phone,
        email: data.email,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country || existing.country || 'US',
        googlePlaceId: data.googlePlaceId || null,
        googleMapsUrl: data.googleMapsUrl || null,
        wrhqDirectoryUrl: data.wrhqDirectoryUrl || null,
        hasShopLocation: data.hasShopLocation ?? true,
        offersMobileService: data.offersMobileService ?? false,
        offersWindshieldRepair: data.offersWindshieldRepair ?? existing.offersWindshieldRepair,
        offersWindshieldReplacement: data.offersWindshieldReplacement ?? existing.offersWindshieldReplacement,
        offersSideWindowRepair: data.offersSideWindowRepair ?? existing.offersSideWindowRepair,
        offersBackWindowRepair: data.offersBackWindowRepair ?? existing.offersBackWindowRepair,
        offersSunroofRepair: data.offersSunroofRepair ?? existing.offersSunroofRepair,
        offersRockChipRepair: data.offersRockChipRepair ?? existing.offersRockChipRepair,
        offersAdasCalibration: data.offersAdasCalibration ?? existing.offersAdasCalibration,
        serviceAreas: data.serviceAreas || [],
        logoUrl: data.logoUrl || null,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        brandVoice: data.brandVoice,
        wordpressUrl: data.wordpressUrl || null,
        wordpressUsername: data.wordpressUsername || null,
        wordpressAppPassword: encryptedPassword,
        ctaText: data.ctaText,
        ctaUrl: data.ctaUrl || null,
        creatifyTemplateId: data.creatifyTemplateId || null,
        preferredPublishTime: data.preferredPublishTime,
        timezone: data.timezone,
        socialPlatforms: data.socialPlatforms || [],
        socialAccountIds: data.socialAccountIds || null,
        podbeanPodcastId: data.podbeanPodcastId || null,
        podbeanPodcastTitle: data.podbeanPodcastTitle || null,
        podbeanPodcastUrl: data.podbeanPodcastUrl || null,
        wrhqYoutubePlaylistId: data.wrhqYoutubePlaylistId || null,
        wrhqYoutubePlaylistTitle: data.wrhqYoutubePlaylistTitle || null,
        status: data.status || existing.status,
        // Automation settings
        autoScheduleEnabled: data.autoScheduleEnabled ?? existing.autoScheduleEnabled,
        autoScheduleFrequency: data.autoScheduleFrequency ?? existing.autoScheduleFrequency,
      },
    })

    console.log('[Client Update] Saved successfully:', {
      businessName: client.businessName,
      hasPasswordAfterSave: !!client.wordpressAppPassword,
      savedPasswordPrefix: client.wordpressAppPassword?.substring(0, 10),
    })

    // Don't send encrypted password to frontend
    const { wordpressAppPassword: _, ...clientWithoutPassword } = client
    return NextResponse.json({
      ...clientWithoutPassword,
      wordpressAppPassword: null,
      hasWordPressPassword: !!client.wordpressAppPassword,
    })
  } catch (error) {
    console.error('Failed to update client:', error)
    return NextResponse.json(
      { error: 'Failed to update client' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    await prisma.client.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete client:', error)
    return NextResponse.json(
      { error: 'Failed to delete client' },
      { status: 500 }
    )
  }
}
