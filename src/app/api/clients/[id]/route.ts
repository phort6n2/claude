import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeAllowedOrigins } from '@/lib/webhook-forwarding'
import { requireAdmin, scrubClient } from '@/lib/admin-guard'
import { deleteClientCompletely } from '@/lib/client-teardown'
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
    for (const key of ['contactPerson', 'googlePlaceId', 'googleMapsUrl', 'websiteUrl', 'logoUrl'] as const) {
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
      'filesInsuranceClaims',
      'seoClient',
      'smsCapable',
      'callCoachingEnabled',
    ] as const) {
      if (has(key)) patch[key] = !!data[key]
    }
    // Numbers, NOT booleans. These sat in the loop above, where `!!` turned a
    // latitude into `true` and Prisma rejected the whole update — so any save
    // that carried coordinates failed, and the failure looked like the form
    // rather than the field.
    for (const key of ['latitude', 'longitude'] as const) {
      if (!has(key)) continue
      const value = data[key]
      const num = typeof value === 'number' ? value : Number(value)
      patch[key] = value === null || value === '' || !Number.isFinite(num) ? null : num
    }
    if (has('rankKeywords')) {
      patch.rankKeywords = Array.isArray(data.rankKeywords)
        ? data.rankKeywords.map((k: unknown) => String(k).trim()).filter(Boolean)
        : []
    }
    if (has('country')) patch.country = data.country || 'US'
    if (has('serviceAreas')) patch.serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : []
    if (has('allowedOrigins')) patch.allowedOrigins = allowedOrigins

    const before = await prisma.client
      .findUnique({ where: { id }, select: { seoClient: true } })
      .catch(() => null)

    const client = await prisma.client.update({
      where: { id },
      data: patch,
    })

    // Moving a shop between tiers has to reach the scan itself: four keywords
    // and weekly instead of two and monthly. Otherwise the plan changes, the
    // invoice changes, and the campaign carries on exactly as it was.
    if (before && has('seoClient') && before.seoClient !== client.seoClient) {
      const { syncCampaignTier } = await import('@/lib/rank-campaigns')
      const synced = await syncCampaignTier(id)
      console.log(
        `[RankCampaigns] ${client.businessName} tier → ${client.seoClient ? 'seo' : 'standard'}: ${synced.message}`
      )
    }

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

  const { id } = await params

  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The caller must name the client it is deleting. This endpoint used to
  // destroy a client — and, by cascade, every lead, call recording and photo
  // belonging to them — on a bare DELETE with an id in the URL. An id is easy
  // to have wrong and impossible to sanity-check by eye; a business name is
  // not. It is also the difference between a misfired request and an
  // intentional one.
  const body = await request.json().catch(() => ({}))
  const confirm = typeof body.confirm === 'string' ? body.confirm.trim() : ''
  if (confirm.toLowerCase() !== client.businessName.trim().toLowerCase()) {
    return NextResponse.json(
      {
        error: `To delete this client, send its exact business name as "confirm". Expected "${client.businessName}".`,
      },
      { status: 400 }
    )
  }

  const result = await deleteClientCompletely(id)
  if (!result.ok) {
    console.error('Failed to delete client:', result.error)
    return NextResponse.json({ error: result.error || 'Failed to delete client' }, { status: 500 })
  }

  return NextResponse.json({ success: true, steps: result.steps, warnings: result.warnings })
}
