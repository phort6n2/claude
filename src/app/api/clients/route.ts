import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { generateSlug } from '@/lib/utils'
import { normalizeAllowedOrigins } from '@/lib/webhook-forwarding'
import { requireAdmin, scrubClient } from '@/lib/admin-guard'
import { syncClientToWrhq } from '@/lib/wrhq-sync'
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

    // Say WHICH field is missing. A blank business name used to fall through
    // to the Prisma insert and come back as "Failed to create client" with a
    // 500 — a message that names nothing, on a form with six sections and no
    // field marked required.
    const required: Array<[string, string]> = [
      ['businessName', 'Business name'],
      ['phone', 'Phone'],
      ['email', 'Email'],
    ]
    const missing = required.filter(([key]) => !String(data[key] || '').trim()).map(([, label]) => label)
    if (missing.length) {
      return NextResponse.json(
        { error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.` },
        { status: 400 }
      )
    }

    // Generate slug from business name
    const slug = generateSlug(data.businessName)
    if (!slug) {
      return NextResponse.json(
        { error: 'That business name has no letters or numbers in it, so it cannot make a web address.' },
        { status: 400 }
      )
    }

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

    // Give them their Windshield Repair HQ Partner listing.
    //
    // Awaited so the operator is told what happened, but syncClientToWrhq
    // never throws: a directory that is down must not fail the creation in
    // front of them, and the row is already written by this point. A miss is
    // recoverable from /api/admin/wrhq-sync, which re-syncs every client.
    //
    // domains is empty because a client created a moment ago has none yet —
    // the listing links to their hosted site until a custom domain is added,
    // and the next sync moves it.
    const wrhq = await syncClientToWrhq({ ...client, domains: [] })
    if (!wrhq.ok && !wrhq.skipped) {
      console.error('[clients] WRHQ listing not created:', wrhq.error)
    }

    return NextResponse.json({ ...client, wrhq }, { status: 201 })
  } catch (error) {
    console.error('Failed to create client:', error)
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
