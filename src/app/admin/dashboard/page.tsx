export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { Settings, Radio, ArrowRight } from 'lucide-react'
import { PageContainer, PageHeader, DashboardSkeleton } from '@/components/ui/theme'
import { requireAdminPage } from '@/lib/admin-guard'
import { getClientHealth, HEALTH_COLUMNS } from '@/lib/client-health'
import ClientHealthTable from '@/components/admin/ClientHealthTable'

/**
 * WHAT THE OPERATOR NEEDS AT 9PM, WHICH IS NOT A LEAD COUNT.
 *
 * This page used to lead with "9,207 unworked leads", "36 today", "397 this
 * week" and two recent-activity lists. Every one of those is a number that
 * goes up on its own and that nobody can act on: 9,207 is four years of
 * history, not a to-do, and a lead landing is the ONE event in this platform
 * that announces itself — the shop is emailed, texted and rung about it.
 *
 * What does not announce itself is everything this app has actually lost money
 * to: a `<Dial record>` value one letter wrong, a Twilio namespace import that
 * 500'd every inbound call, tracking numbers bought with no SmsUrl, an alert
 * list with nobody on it. Each produced no error and no missing row — only an
 * absence indistinguishable from a quiet week, and each ran for weeks because
 * nothing in the app ever looked at all fifteen clients side by side.
 *
 * So the dashboard IS that look: one row per client, one column per silent
 * failure, worst first. See client-health.ts for why a dash is not a cross.
 */
export default async function AdminDashboard() {
  await requireAdminPage()

  return (
    <PageContainer>
      <PageHeader
        title="Client health"
        subtitle="Every client, and whether the things that fail quietly are working."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/ads-findings"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Radio className="h-4 w-4" />
              Needs action
            </Link>
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        }
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <HealthBoard />
      </Suspense>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
        >
          All clients <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
        >
          Leads <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/admin/call-coaching-insights"
          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
        >
          Call coaching <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </PageContainer>
  )
}

async function HealthBoard() {
  const rows = await getClientHealth()
  /* ALWAYS ALPHABETICAL, and never re-ordered by how bad a client's morning
     is. A board that sorts itself worst-first moves rows around between
     visits, so the shop you looked at yesterday is somewhere else today and
     you have to read the column to find it again — and the one thing an
     operator does most on this page is check a client they already have in
     mind. The summary line and the per-column tally do the finding instead,
     which is why they exist. `localeCompare` so "Álvarez" files under A. */
  const sorted = [...rows].sort((a, b) =>
    a.businessName.localeCompare(b.businessName, 'en', { sensitivity: 'base' })
  )
  return <ClientHealthTable rows={sorted} columns={HEALTH_COLUMNS} />
}
