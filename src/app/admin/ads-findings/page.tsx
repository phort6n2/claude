export const dynamic = 'force-dynamic'

import { requireAdminPage } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import AdsFindingsList, { type FindingRow } from '@/components/admin/AdsFindingsList'
import RunAdsChecksButton from '@/components/admin/RunAdsChecksButton'

/**
 * The Google Ads findings inbox — what the scheduled checks say needs
 * action, across every account. Open findings lead; the resolved and
 * dismissed tail is kept two weeks so "did that clear or did I dismiss it"
 * stays answerable.
 */
export default async function Page() {
  await requireAdminPage()

  const twoWeeksAgo = new Date(new Date().getTime() - 14 * 86_400_000)
  const findings = await prisma.adsFinding
    .findMany({
      where: {
        OR: [{ status: 'OPEN' }, { lastSeenAt: { gte: twoWeeksAgo } }],
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      include: { client: { select: { businessName: true } } },
    })
    .catch(() => [])

  const rows: FindingRow[] = findings.map((f) => ({
    id: f.id,
    clientId: f.clientId,
    clientName: f.client.businessName,
    check: f.check,
    cadence: f.cadence,
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    status: f.status,
    firstSeenAt: f.firstSeenAt.toISOString(),
    lastSeenAt: f.lastSeenAt.toISOString(),
    evidence: f.evidence,
  }))

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Needs action</h1>
          <p className="text-sm text-gray-500 mt-1">
            The daily check runs every morning and emails you anything new. Every finding carries
            its evidence — the window and the numbers the claim rests on. Mostly Google Ads
            anomalies, plus site checks that run for every client whether or not this platform
            manages their ads.
          </p>
        </div>
        <RunAdsChecksButton />
      </div>
      <div className="mt-5">
        <AdsFindingsList findings={rows} />
      </div>
    </div>
  )
}
