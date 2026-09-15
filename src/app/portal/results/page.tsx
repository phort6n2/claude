export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getMonthlyReport } from '@/lib/monthly-report'
import { prisma } from '@/lib/db'
import MonthlyReportView from '@/components/MonthlyReport'
import LastMonthReport from '@/components/portal/LastMonthReport'
import type { MonthlyDigest } from '@/lib/monthly-digest'

/**
 * "Reporting" in the client portal — what the money bought.
 *
 * TWO QUESTIONS, ONE PAGE. Last month in depth at the top (enquiries by
 * channel, ad spend, cost per conversion, campaigns, keywords, what was done,
 * what is next) and the twelve-month trend under it. A shop owner asking
 * "what happened in February" is thirty seconds from asking "is this working
 * at all", and two pages for those two questions is two places to look.
 *
 * The URL stays /portal/results so the Booked tile on the home screen still
 * lands here; the tab label is "Reporting", which is what the page now is.
 *
 * THE MONTH BLOCK IS THE STORED SNAPSHOT, not a live query — it is the same
 * payload that was emailed, so the page and the inbox cannot disagree. Absent
 * until the 1st-of-month run has built one, and the page is still the trend
 * on its own until then.
 */
export default async function PortalReportingPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const [report, latest] = await Promise.all([
    getMonthlyReport(session.clientId),
    // The newest month we have BUILT, sent or not. A shop looking at their own
    // report before it has been mailed is not a problem — the email is the
    // nudge, the page is the artifact.
    prisma.clientMonthlyReport
      .findFirst({
        where: { clientId: session.clientId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        select: { payload: true, note: true },
      })
      .catch(() => null),
  ])

  const digest = (latest?.payload as unknown as MonthlyDigest) || null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reporting</h1>
        <p className="text-gray-600">
          Enquiries delivered to {session.businessName}, what you booked from them, and what it
          was worth.
        </p>
      </div>
      {digest?.businessName && <LastMonthReport digest={digest} note={latest?.note ?? null} />}
      <MonthlyReportView report={report} />
    </div>
  )
}
