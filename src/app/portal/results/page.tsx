export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getMonthlyReport } from '@/lib/monthly-report'
import { prisma } from '@/lib/db'
import MonthlyReportView from '@/components/MonthlyReport'
import LastMonthReport from '@/components/portal/LastMonthReport'
import type { MonthlyDigest } from '@/lib/monthly-digest'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getPortalSections } from '@/lib/portal-sections'
import { reportSectionsFor } from '@/lib/portal-nav'

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

  const [report, latest, sections] = await Promise.all([
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
    getPortalSections(session.clientId),
  ])

  // Every other report, as cards at the foot of the Summary. The sub-tab row
  // above scrolls on a narrow phone, and a report that is only reachable by
  // noticing a half-hidden tab is the tile-only mistake in a new shape.
  const others = reportSectionsFor(sections).filter((s) => s.href !== '/portal/results')

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

      {others.length > 0 && (
        <section aria-labelledby="more-reports" className="pt-2">
          <h2 id="more-reports" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            More reports
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map((s) => {
              const Icon = s.icon
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm no-underline transition-colors hover:border-[var(--brand-edge)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">{s.label}</span>
                    <span className="block text-sm text-gray-500">{s.blurb}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 group-hover:text-gray-500" />
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
