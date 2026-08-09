import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeAllowedOrigins } from '@/lib/webhook-forwarding'
import { requireAdmin, scrubClient } from '@/lib/admin-guard'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(scrubClient(client))
  } catch (error) {
    console.error('Failed to fetch client:', error)
    return NextResponse.json(
      { error: 'Failed to fetch client' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const { id } = await params
    const data = await request.json()

    const existing = await prisma.client.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const { origins: allowedOrigins, invalid: invalidOrigins } = normalizeAllowedOrigins(
      data.allowedOrigins ?? existing.allowedOrigins
    )
    if (invalidOrigins.length > 0) {
      return NextResponse.json(
        { error: `Invalid origin(s): ${invalidOrigins.join(', ')}` },
        { status: 400 }
      )
    }

    /**
     * PARTIAL patch: only keys actually present in the payload are written.
     * The editor is split across routes that each save their own fields, so a
     * payload that omits a field must LEAVE IT ALONE — writing `undefined`
     * from an absent key is how a tab-scoped save silently wipes another
     * tab's data.
     */
    const patch: Record<string, unknown> = {}
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key)
    const setIf = (key: string, value: unknown) => {
      if (has(key)) patch[key] = value
    }

    // Text fields that may be blanked to null.
    for (const key of ['contactPerson', 'googlePlaceId', 'googleMapsUrl', 'logoUrl'] as const) {
      setIf(key, data[key] || null)
    }
    // Plain scalars, written as given.
    for (const key of [
      'businessName',
      'phone',
      'email',
      'streetAddress',
      'city',
      'state',
      'postalCode',
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'timezone',
      'status',
    ] as const) {
      setIf(key, data[key])
    }
    // Booleans.
    for (const key of [
      'hasShopLocation',
      'offersMobileService',
      'offersWindshieldRepair',
      'offersWindshieldReplacement',
      'offersSideWindowRepair',
      'offersBackWindowRepair',
      'offersSunroofRepair',
      'offersRockChipRepair',
      'offersAdasCalibration',
      'callCoachingEnabled',
    ] as const) {
      if (has(key)) patch[key] = !!data[key]
    }
    if (has('country')) patch.country = data.country || 'US'
    if (has('serviceAreas')) patch.serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : []
    if (has('allowedOrigins')) patch.allowedOrigins = allowedOrigins

    const client = await prisma.client.update({
      where: { id },
      data: patch,
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
  const denied = await requireAdmin()
  if (denied) return denied

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
