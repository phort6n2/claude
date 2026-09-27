export const dynamic = 'force-dynamic'

import { requireAdminPage } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import MonthlyReportsList, { type ReportRow } from '@/components/admin/MonthlyReportsList'
import { monthLabel } from '@/lib/tz'
import SeoReportInbox, { type InboxRow } from '@/components/admin/SeoReportInbox'
import type { MonthlyDigest } from '@/lib/monthly-digest'

/**
 * The month's reports, built by the 1st-of-month cron and sent by hand.
 *
 * The build and the send are deliberately separate — see
 * lib/monthly-report-run.ts. This page is the read between them.
 */
export default async function Page() {
  await requireAdminPage()

  const reports = await prisma.clientMonthlyReport
    .findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { builtAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        clientId: true,
        year: true,
        month: true,
        payload: true,
        note: true,
        builtAt: true,
        sentAt: true,
        sentTo: true,
        sendError: true,
        client: {
          select: {
            businessName: true,
            seoClient: true,
            // The recipient list, resolved here so the row can say "nobody to
            // send to" rather than the button failing when it is pressed.
            clientUsers: { select: { email: true } },
          },
        },
      },
    })
    .catch(() => [])

  const rows: ReportRow[] = reports.map((r) => {
    const digest = r.payload as unknown as MonthlyDigest | null
    return {
      id: r.id,
      clientId: r.clientId,
      businessName: r.client.businessName,
      label: monthLabel(r.year, r.month),
      enquiries: digest?.enquiries?.total ?? 0,
      booked: digest?.enquiries?.booked ?? 0,
      revenue: digest?.enquiries?.revenue ?? 0,
      spend: digest?.ads?.spend ?? null,
      costPerConversion: digest?.ads?.costPerConversion ?? null,
      adsProblem: digest?.adsError ?? null,
      workItems: digest?.work?.length ?? 0,
      findings: digest?.nextSteps?.length ?? 0,
      note: r.note,
      builtAt: r.builtAt.toISOString(),
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      sentTo: r.sentTo,
      sendError: r.sendError,
      recipients: r.client.clientUsers.map((u) => u.email),
      seo: digest?.seo ? 'included' : r.client.seoClient ? 'waiting' : 'none',
      seoProblems: digest?.seo?.problems ?? [],
    }
  })

  const [inbox, clients] = await Promise.all([
    prisma.seoReportEmail
      .findMany({
        orderBy: { receivedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          receivedAt: true,
          sender: true,
          subject: true,
          kind: true,
          site: true,
          year: true,
          month: true,
          pdfUrl: true,
          problem: true,
          clientId: true,
          parsed: true,
          client: { select: { businessName: true } },
        },
      })
      // Before the bootstrap has created the table, the page still renders.
      .catch(() => []),
    prisma.client.findMany({ select: { id: true, businessName: true }, orderBy: { businessName: 'asc' } }),
  ])
  const inboxRows: InboxRow[] = inbox.map((m) => ({
    id: m.id,
    receivedAt: m.receivedAt.toISOString(),
    sender: m.sender,
    subject: m.subject,
    kind: m.kind,
    site: m.site,
    label: m.year && m.month ? monthLabel(m.year, m.month) : null,
    pdfUrl: m.pdfUrl,
    problem: m.problem,
    clientName: m.client?.businessName ?? null,
    // Assignable: a report that was READ, but matched no shop.
    assignable: m.kind === 'report' && !m.clientId && !!m.parsed,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Monthly reports</h1>
        <p className="text-gray-600">
          Built on the 1st for the month that just ended. Nothing is emailed until you send it.
        </p>
      </div>
      <MonthlyReportsList rows={rows} />
      <SeoReportInbox rows={inboxRows} clients={clients} />
    </div>
  )
}
