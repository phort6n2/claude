export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { relativeAge, statusStyle } from '@/lib/lead-display'
import { formatDateTime } from '@/lib/utils'
import {
  Users,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Settings,
  UserCheck,
  PhoneCall,
  Radio,
} from 'lucide-react'
import {
  GradientStatCard,
  NeutralStatCard,
  StatCardGrid,
  PageContainer,
  PageHeader,
  ContentCard,
  ContentCardHeader,
  EmptyState,
  DashboardSkeleton,
} from '@/components/ui/theme'
import { requireAdminPage } from '@/lib/admin-guard'
import { getFailingDestinations } from '@/lib/delivery-health'

async function getStats() {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0))
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Two hours: long enough that a shop mid-job has not "failed" to answer,
  // short enough that a lead going cold is still worth a phone call. The
  // whole point of this tile is that it is actionable within the day.
  const staleAfter = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const [
    unworkedLeads,
    leadsToday,
    leadsThisWeek,
    failedAnalyses,
    recentLeads,
    recentCalls,
  ] = await Promise.all([
    // Was Active Clients — a number that is the same every day and cannot be
    // acted on. What this page has to answer first is "what needs me today",
    // and that is leads nobody has touched.
    prisma.lead.count({
      where: { status: 'NEW', duplicateOfLeadId: null, createdAt: { lte: staleAfter } },
    }),
    prisma.lead.count({
      where: { createdAt: { gte: startOfToday }, duplicateOfLeadId: null },
    }),
    prisma.lead.count({
      where: { createdAt: { gte: startOfWeek }, duplicateOfLeadId: null },
    }),
    prisma.callAnalysis.count({ where: { status: 'FAILED' } }),
    prisma.lead.findMany({
      where: { duplicateOfLeadId: null },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { businessName: true, id: true } },
      },
    }),
    prisma.callAnalysis.findMany({
      where: { status: 'COMPLETE' },
      take: 10,
      orderBy: { completedAt: 'desc' },
      include: {
        client: { select: { businessName: true, id: true } },
      },
    }),
  ])

  return {
    unworkedLeads,
    leadsToday,
    leadsThisWeek,
    failedAnalyses,
    recentLeads,
    recentCalls,
  }
}

async function DashboardContent() {
  const stats = await getStats()
  // Above the fold, deliberately. A client whose leads are not arriving is
  // more urgent than any number on this page, and the only place it showed
  // before was that one client's own tab.
  const failing = await getFailingDestinations()

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle="Leads and call coaching across all clients"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/webhook-status"
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-all shadow-sm"
            >
              <Radio className="h-4 w-4" />
              Webhook Status
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-all shadow-sm"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        }
      />

      {failing.length > 0 && (
        <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-5">
          <h2 className="font-bold text-red-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Leads are not reaching {failing.length === 1 ? failing[0].businessName : `${failing.length} clients`}
          </h2>
          <p className="text-sm text-red-800 mb-3">
            Captured, but the forward failed. Retries continue for 24 hours, then stop.
          </p>
          <div className="space-y-2">
            {failing.map((f) => (
              <div key={f.destinationId} className="rounded-xl bg-white border border-red-200 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/admin/clients/${f.clientId}/leads-setup`}
                    className="font-semibold text-gray-900 hover:text-blue-700"
                  >
                    {f.businessName}
                  </Link>
                  <span className="text-xs text-gray-500">{f.label}</span>
                  <span className="text-xs font-semibold text-red-700">
                    {f.responseStatus ?? 'no response'} · {f.failedCount} undelivered
                  </span>
                </div>
                <p className="text-sm text-gray-700">{f.diagnosis}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <StatCardGrid cols={4}>
        <NeutralStatCard
          title="Unworked leads"
          value={stats.unworkedLeads}
          subtitle={
            stats.unworkedLeads === 0 ? 'Everything has been touched' : 'Still NEW after 2 hours'
          }
          icon={<UserCheck />}
          isAlert={stats.unworkedLeads > 0}
        />
        <GradientStatCard
          title="Leads Today"
          value={stats.leadsToday}
          subtitle="Unique contacts"
          icon={<UserCheck />}
          variant="green"
        />
        <GradientStatCard
          title="Leads This Week"
          value={stats.leadsThisWeek}
          subtitle="Last 7 days"
          icon={<PhoneCall />}
          variant="violet"
        />
        <NeutralStatCard
          title="Failed Call Analyses"
          value={stats.failedAnalyses}
          subtitle={stats.failedAnalyses === 0 ? 'All systems healthy' : 'Need attention'}
          icon={<AlertTriangle />}
          isAlert={stats.failedAnalyses > 0}
        />
      </StatCardGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Leads */}
        <ContentCard padding="none">
          <ContentCardHeader
            title="Recent Leads"
            icon={<UserCheck />}
            actions={
              <Link
                href="/admin/leads"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {stats.recentLeads.length === 0 ? (
            <EmptyState
              icon={<UserCheck />}
              title="No leads yet"
              description="New leads will appear here as they arrive"
            />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {stats.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/admin/leads/${lead.id}`}
                  className="p-4 hover:bg-gray-50 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
                          lead.email ||
                          lead.phone ||
                          'Unknown contact'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {lead.client.businessName}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span title={formatDateTime(lead.createdAt)}>
                          {relativeAge(lead.createdAt)}
                        </span>
                      </p>
                    </div>
                    {/* Status, not source. Every row said WEB or PHONE, which
                        is the same on nearly all of them and answers nothing;
                        whether a lead has been handled is the question this
                        list is read for. */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle(lead.status).bgColor} ${statusStyle(lead.status).color}`}
                    >
                      {statusStyle(lead.status).label}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ContentCard>

        {/* Recent Call Analyses */}
        <ContentCard padding="none">
          <ContentCardHeader
            title="Recent Call Analyses"
            icon={<PhoneCall />}
            actions={
              <Link
                href="/admin/call-coaching-insights"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {stats.recentCalls.length === 0 ? (
            <EmptyState
              icon={<PhoneCall />}
              title="No analysed calls yet"
              description="Call gradings will appear here once recordings are processed"
            />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {stats.recentCalls.map((call) => (
                <div key={call.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {call.client.businessName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {call.outcome
                          ? call.outcome.charAt(0) +
                            call.outcome.slice(1).toLowerCase().replace(/_/g, ' ')
                          : 'No outcome recorded'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {call.completedAt ? formatDateTime(call.completedAt) : ''}
                      </p>
                    </div>
                    {typeof call.score === 'number' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {call.score}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ContentCard>
      </div>

      {/* Quick Actions removed: four cards duplicating sidebar links that are
          already one click away, costing ~200px on every visit to the page
          most often opened to answer "what needs me today". */}
    </PageContainer>
  )
}

function LoadingSkeleton() {
  return <DashboardSkeleton />
}

export default async function DashboardPage() {
  await requireAdminPage()

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
