import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { generateSlug } from '@/lib/utils'
import { normalizeAllowedOrigins } from '@/lib/webhook-forwarding'
import { requireAdmin, scrubClient } from '@/lib/admin-guard'
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const clients = await withRetry(() =>
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
      })
    )
    return NextResponse.json(clients.map(scrubClient))
  } catch (error) {
    console.error('Failed to fetch clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

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

    const { origins: allowedOrigins, invalid: invalidOrigins } = normalizeAllowedOrigins(
      data.allowedOrigins
    )
    if (invalidOrigins.length > 0) {
      return NextResponse.json(
        { error: `Invalid origin(s): ${invalidOrigins.join(', ')}` },
        { status: 400 }
      )
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
        timezone: data.timezone || 'America/Denver',
        allowedOrigins,
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
