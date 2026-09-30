import { formServiceNames } from '@/lib/site-services'
import { siteIsLive } from '@/lib/site-preview'
import { widgetCtaColors } from '@/lib/site-theme'
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
      smsCapable: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
    },
  })

  if (!client || !siteIsLive(client.status)) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: CORS })
  }

  // The same list the hosted pages inline — see formServiceNames.
  const services = formServiceNames(client)

  return NextResponse.json(
    {
      slug: client.slug,
      businessName: client.businessName,
      phone: client.phone,
      logoUrl: client.logoUrl,
      primaryColor: client.primaryColor || '#1e40af',
      secondaryColor: client.secondaryColor || '#3b82f6',
      accentColor: client.accentColor || '#f59e0b',
      ...widgetCtaColors(client.primaryColor, client.accentColor),
      services,
      offersMobileService: client.offersMobileService,
      smsCapable: client.smsCapable,
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
