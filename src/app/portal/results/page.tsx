export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getMonthlyReport } from '@/lib/monthly-report'
import MonthlyReportView from '@/components/MonthlyReport'

/**
 * "Results" in the client portal — what the money bought.
 *
 * The companion to Activity: that page says what has been done, this one says
 * what came of it. Deliberately the plainer of the two, because this is the
 * page a shop owner opens when they are deciding whether to keep paying.
 */
export default async function PortalResultsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const report = await getMonthlyReport(session.clientId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Results</h1>
        <p className="text-gray-600">
          Enquiries delivered to {session.businessName}, what you booked from them, and what it
          was worth.
        </p>
      </div>
      <MonthlyReportView report={report} />
    </div>
  )
}
