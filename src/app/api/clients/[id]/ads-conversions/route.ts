import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { auditConversionSetup, CONVERSION_STANDARD } from '@/lib/google-ads-conventions'
import { auditCampaignGoals, standardRefsFrom } from '@/lib/google-ads-campaign-goals'

export const dynamic = 'force-dynamic'
// Several API calls to Google, and their search endpoint is not fast.
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

  // Whether the CAMPAIGNS bid to those actions is a separate question with a
  // separate answer: biddability lives on a category goal, and a campaign may
  // carry its own set that overrides the account's. An account can pass the
  // audit above while every campaign that spends money optimises to something
  // else. Failing to read it is not "no problems" — the card says which.
  const refs = standardRefsFrom(result.audit)
  const campaigns = await auditCampaignGoals(tracking.googleAdsCustomerId, refs)

  return NextResponse.json({
    standard: CONVERSION_STANDARD,
    audit: result.audit,
    campaignGoals: campaigns.ok ? campaigns.report : null,
    campaignGoalsError: campaigns.ok ? null : campaigns.error,
  })
}
