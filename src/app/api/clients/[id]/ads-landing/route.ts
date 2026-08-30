import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { auditLandingUrls } from '@/lib/google-ads-landing'

export const dynamic = 'force-dynamic'
// Five GAQL calls, and their search endpoint is not fast.
export const maxDuration = 60

/**
 * GET — does every live ad, asset group and sitelink in this client's account
 * land on the app-hosted site? Reads only, on both sides.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      slug: true,
      siteSubdomain: true,
      domains: { select: { domain: true } },
      adsTracking: { select: { googleAdsCustomerId: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  if (!client.adsTracking?.googleAdsCustomerId) {
    return NextResponse.json({
      audit: null,
      reason: 'No Google Ads account is linked to this client yet.',
    })
  }

  const result = await auditLandingUrls(client.adsTracking.googleAdsCustomerId, {
    slug: client.slug,
    siteSubdomain: client.siteSubdomain,
    domains: client.domains.map((d) => d.domain),
  })
  if (!result.ok) {
    return NextResponse.json({ audit: null, reason: result.error })
  }
  return NextResponse.json({ audit: result.audit })
}
