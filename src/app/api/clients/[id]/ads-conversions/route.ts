import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { auditConversionSetup, CONVERSION_STANDARD } from '@/lib/google-ads-conventions'

export const dynamic = 'force-dynamic'
// Two API calls to Google, and their search endpoint is not fast.
export const maxDuration = 60

/**
 * GET — is this client's Google Ads account set up the way every other one
 * is?
 *
 * Reads only. The standard itself is returned alongside the findings so the
 * card can show the checklist for an account that has not been set up yet,
 * rather than only being useful once something exists to audit.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const tracking = await prisma.clientAdsTracking
    .findUnique({
      where: { clientId: id },
      select: { googleAdsCustomerId: true, offlineConversionActionId: true },
    })
    .catch(() => null)

  if (!tracking?.googleAdsCustomerId) {
    return NextResponse.json({
      standard: CONVERSION_STANDARD,
      audit: null,
      // Not an error: a client with no account linked has nothing to check,
      // and the checklist is what they need instead.
      reason: 'No Google Ads account is linked to this client yet.',
    })
  }

  const result = await auditConversionSetup(tracking.googleAdsCustomerId, {
    offlineConversionActionId: tracking.offlineConversionActionId,
  })
  if (!result.ok) {
    return NextResponse.json({ standard: CONVERSION_STANDARD, audit: null, reason: result.error })
  }

  return NextResponse.json({ standard: CONVERSION_STANDARD, audit: result.audit })
}
