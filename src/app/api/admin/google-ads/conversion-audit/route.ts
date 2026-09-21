import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { auditConversionSetup } from '@/lib/google-ads-conventions'
import { LIVE_STATUSES } from '@/lib/site-preview'

export const dynamic = 'force-dynamic'
// One account is two Google calls; a dozen accounts is the whole budget.
export const maxDuration = 300

/**
 * GET — every client with a linked Google Ads account, audited against the
 * one standard.
 *
 * The point of a convention is that it can be checked in one pass. Per-client
 * cards tell you about the client you are already looking at; this tells you
 * which of the fifteen are wrong, which is the question that actually gets
 * asked.
 *
 * Sequential on purpose. Google's search endpoint rate-limits per developer
 * token, and fifteen accounts fanned out in parallel is how a sweep that
 * should take a minute comes back half-failed.
 */
export async function GET(_request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client
    .findMany({
      /* ONBOARDING IS LIVE — the third module to get this wrong. `=== 'ACTIVE'`
         skipped every shop onboarded the normal way, because intake approval
         creates them as ONBOARDING and those sites are up and spending on
         purpose. So the one sweep that reads every account at once quietly
         omitted exactly the clients whose setup is newest and least checked.
         Use LIVE_STATUSES, never an equality check. */
      where: { status: { in: [...LIVE_STATUSES] }, adsTracking: { googleAdsCustomerId: { not: null } } },
      select: {
        id: true,
        businessName: true,
        adsTracking: {
          select: {
            googleAdsCustomerId: true,
            offlineConversionActionId: true,
            conversionId: true,
          },
        },
      },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  const results = []
  for (const client of clients) {
    const customerId = client.adsTracking?.googleAdsCustomerId
    if (!customerId) continue
    const audit = await auditConversionSetup(customerId, {
      offlineConversionActionId: client.adsTracking?.offlineConversionActionId,
      siteConversionId: client.adsTracking?.conversionId,
    })
    results.push({
      clientId: client.id,
      businessName: client.businessName,
      customerId,
      ...(audit.ok
        ? {
            clean: audit.audit.clean,
            problems: [
              ...audit.audit.findings
                .filter((f) => f.state !== 'ok')
                .map((f) => `${f.name}: ${f.fix || f.differences.join(' ')}`),
              ...audit.audit.goalIssues,
              /* accountSettings was left out, so the ONE view that reads every
                 account at once was blind to the account-level plumbing —
                 including a site tagged for the wrong account, which is the
                 fault this sweep is most likely to be the first to see. It
                 counts against `clean`, so omitting it printed a client as
                 having problems with nothing listed under them. */
              ...audit.audit.accountSettings,
            ],
          }
        : { clean: false, problems: [audit.error] }),
    })
  }

  return NextResponse.json({
    checked: results.length,
    clean: results.filter((r) => r.clean).length,
    clients: results,
  })
}
