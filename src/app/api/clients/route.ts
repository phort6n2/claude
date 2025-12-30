import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateSlug } from '@/lib/utils'
import { encrypt } from '@/lib/encryption'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    })
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
      try {
        encryptedPassword = encrypt(data.wordpressAppPassword)
      } catch {
        // If encryption fails, we still want to save the client
        console.error('Failed to encrypt password')
      }
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
        hasShopLocation: data.hasShopLocation ?? true,
        offersMobileService: data.offersMobileService ?? false,
        hasAdasCalibration: data.hasAdasCalibration ?? false,
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
        preferredPublishTime: data.preferredPublishTime || '09:00',
        timezone: data.timezone || 'America/Los_Angeles',
        postsPerWeek: data.postsPerWeek || 2,
        socialPlatforms: data.socialPlatforms || [],
        status: 'ACTIVE',
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Failed to create client:', error)
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
