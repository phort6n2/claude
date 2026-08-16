export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { getMonthlyReport } from '@/lib/monthly-report'
import MonthlyReportView from '@/components/MonthlyReport'

/**
 * The client's Results page, as the admin sees it.
 *
 * Same component and same data as their own portal tab on purpose — a client
 * asking "where does this number come from" needs the answer to be "the same
 * place you are looking at".
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, businessName: true },
  })
  if (!client) notFound()

  const report = await getMonthlyReport(id)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Exactly what this client sees on their own Results tab.
      </p>
      <MonthlyReportView report={report} />
    </div>
  )
}
