export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, Gauge, Inbox } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isMasterLeadsEmail } from '@/lib/master-leads-access'
import CampaignReport, { CampaignReportSkeleton } from '@/components/admin/CampaignReport'
import { getCampaignReport } from '@/lib/campaign-report-fetch'
import { isRangeId, type RangeId } from '@/lib/campaign-report'
import { MarkLaunched } from './mark-launched'

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
      <MarkLaunched />
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">Campaigns</h1>
            {/* One line at every width: the control bar below sticks at this
                header's height, so a wrapped subtitle would slide under it. */}
            <p className="truncate text-xs text-gray-600">Master Leads · Google Ads, every account</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* This is the app's opening screen, so the leads list is a
                labelled button at every width, not a back arrow to guess at. */}
            <Link
              href="/master-leads"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <Inbox className="h-3.5 w-3.5" />
              Leads
            </Link>
            {/* The Target CPA panel is an admin page; this is the way to it
                from the phone, which has no admin sidebar. */}
            <Link
              href="/admin/target-cpa"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <Gauge className="h-3.5 w-3.5" />
              Target CPA
            </Link>
            <Link
              href="/master-leads/dashboard"
              className="hidden items-center gap-1.5 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
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
  // Under the sticky app header above (its measured height).
  return <CampaignReport initial={data} initialRange={range} stickyTop="top-[69px]" />
}
