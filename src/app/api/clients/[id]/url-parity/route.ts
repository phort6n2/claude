import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { checkUrlParity } from '@/lib/url-parity'
import type { ServiceFlag } from '@/lib/site-services'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — crawl a shop's old site and report what the cutover would break.
 *
 * Read-only on both sides: it fetches their old pages and compares paths.
 * Nothing is stored and nothing on either site changes.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const oldUrl: string = typeof body?.url === 'string' ? body.url.trim() : ''

  const client = await prisma.client
    .findUnique({
      where: { id },
      select: {
        websiteUrl: true,
        serviceAreas: true,
        offersWindshieldRepair: true,
        offersWindshieldReplacement: true,
        offersSideWindowRepair: true,
        offersBackWindowRepair: true,
        offersSunroofRepair: true,
        offersRockChipRepair: true,
        offersAdasCalibration: true,
        offersMobileService: true,
        locations: { select: { city: true } },
      },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Their stored website is the sensible default — it is usually the very site
  // being replaced, and re-typing it is a chance to typo it.
  const target = oldUrl || client.websiteUrl || ''
  if (!target) {
    return NextResponse.json({
      ok: false,
      message: 'No old site to check. Paste its address, or set it on the Business tab.',
    })
  }

  const report = await checkUrlParity(target, {
    serviceAreas: client.serviceAreas || [],
    shopCities: client.locations.map((l) => l.city),
    flags: client as unknown as Record<ServiceFlag, boolean>,
  })

  return NextResponse.json({ ...report, checked: target })
}
