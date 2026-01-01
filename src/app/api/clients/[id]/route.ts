import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encryption'

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

    return NextResponse.json(client)
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
    if (data.wordpressAppPassword && data.wordpressAppPassword !== '') {
      encryptedPassword = encrypt(data.wordpressAppPassword)
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
        googlePlaceId: data.googlePlaceId || null,
        googleMapsUrl: data.googleMapsUrl || null,
        wrhqDirectoryUrl: data.wrhqDirectoryUrl || null,
        hasShopLocation: data.hasShopLocation ?? true,
        offersMobileService: data.offersMobileService ?? false,
        hasAdasCalibration: data.hasAdasCalibration ?? false,
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
        preferredPublishTime: data.preferredPublishTime,
        timezone: data.timezone,
        postsPerWeek: data.postsPerWeek,
        socialPlatforms: data.socialPlatforms || [],
        socialAccountIds: data.socialAccountIds || null,
        podbeanPodcastId: data.podbeanPodcastId || null,
        podbeanPodcastTitle: data.podbeanPodcastTitle || null,
        podbeanPodcastUrl: data.podbeanPodcastUrl || null,
        status: data.status || existing.status,
      },
    })

    return NextResponse.json(client)
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
