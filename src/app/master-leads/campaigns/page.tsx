export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isMasterLeadsEmail } from '@/lib/master-leads-access'
import CampaignReport, { CampaignReportSkeleton } from '@/components/admin/CampaignReport'
import { getCampaignReport } from '@/lib/campaign-report-fetch'
import { isRangeId, type RangeId } from '@/lib/campaign-report'

/**
 * The Google Ads campaign table, inside Master Leads — the app that lives on
 * the operator's home screen. The same component as the admin home, so the
 * two can never show different numbers for one account.
 *
 * Gated HERE, on the server, by the same one-address rule the leads list's
 * data routes use: the layout only proves "a signed-in admin", and this page
 * renders its data in the first response, so a check that ran after mounting
 * would already be too late. Anyone else is sent to the leads page, which
 * says why.
 */
export default async function MasterLeadsCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await auth()
  if (!isMasterLeadsEmail(session?.user?.email)) redirect('/master-leads')
  const { range } = await searchParams

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/master-leads" className="rounded-lg p-2 hover:bg-gray-100" aria-label="Back to leads">
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">Campaigns</h1>
              <p className="text-xs text-gray-600">Master Leads · Google Ads, every account</p>
            </div>
          </div>
          <Link
            href="/master-leads/dashboard"
            className="hidden items-center gap-1.5 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 pb-10">
        <Suspense fallback={<CampaignReportSkeleton />}>
          <Report range={isRangeId(range) ? range : null} />
        </Suspense>
      </main>
    </div>
  )
}

async function Report({ range }: { range: RangeId | null }) {
  const data = await getCampaignReport()
  return <CampaignReport initial={data} initialRange={range} />
}
