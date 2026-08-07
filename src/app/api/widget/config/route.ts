import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/widget/config?client=<slug>
 *
 * Public branding + services config for the embeddable quote widget. Served
 * with open CORS: everything returned is already public (it renders on the
 * client's own website), and the widget must be able to fetch it from any
 * origin before the admin has necessarily added that origin to the allowlist —
 * a misconfigured origin should fail at the *submit* step with a clear
 * message, not render nothing.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('client')
  if (!slug) {
    return NextResponse.json({ error: 'Missing client parameter' }, { status: 400, headers: CORS })
  }

  const client = await prisma.client.findUnique({
    where: { slug },
    select: {
      slug: true,
      status: true,
      businessName: true,
      phone: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      offersMobileService: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
    },
  })

  if (!client || client.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: CORS })
  }

  const services: string[] = []
  if (client.offersWindshieldReplacement) services.push('Windshield Replacement')
  if (client.offersWindshieldRepair) services.push('Windshield Repair')
  if (client.offersRockChipRepair) services.push('Rock Chip Repair')
  if (client.offersSideWindowRepair) services.push('Side Window Repair')
  if (client.offersBackWindowRepair) services.push('Back Window Repair')
  if (client.offersSunroofRepair) services.push('Sunroof Repair')
  if (client.offersAdasCalibration) services.push('ADAS Calibration')

  return NextResponse.json(
    {
      slug: client.slug,
      businessName: client.businessName,
      phone: client.phone,
      logoUrl: client.logoUrl,
      primaryColor: client.primaryColor || '#1e40af',
      secondaryColor: client.secondaryColor || '#3b82f6',
      accentColor: client.accentColor || '#f59e0b',
      services,
      offersMobileService: client.offersMobileService,
      hasShopLocation: client.hasShopLocation,
    },
    {
      headers: {
        ...CORS,
        // Branding changes rarely; let CDNs hold it briefly.
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
    }
  )
}
