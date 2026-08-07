import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
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
        timezone: data.timezone,
        status: data.status || existing.status,
        // Call coaching toggle
        callCoachingEnabled: data.callCoachingEnabled ?? existing.callCoachingEnabled,
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
