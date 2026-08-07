export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/db'
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

async function getStats() {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0))
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    activeClients,
    leadsToday,
    leadsThisWeek,
    failedAnalyses,
    recentLeads,
    recentCalls,
  ] = await Promise.all([
    prisma.client.count({ where: { status: 'ACTIVE' } }),
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
    activeClients,
    leadsToday,
    leadsThisWeek,
    failedAnalyses,
    recentLeads,
    recentCalls,
  }
}

async function DashboardContent() {
  const stats = await getStats()

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

      {/* Stats Cards */}
      <StatCardGrid cols={4}>
        <GradientStatCard
          title="Active Clients"
          value={stats.activeClients}
          subtitle="Receiving leads"
          icon={<Users />}
          variant="blue"
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
                        {formatDateTime(lead.createdAt)}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {lead.source}
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
                        {call.outcome?.replace(/_/g, ' ') || 'No outcome recorded'}
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

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/admin/clients/new" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Add Client</p>
                  <p className="text-xs text-gray-500">New auto glass shop</p>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/admin/leads" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                  <UserCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Leads</p>
                  <p className="text-xs text-gray-500">All client leads</p>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/admin/call-coaching-insights" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-violet-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg group-hover:bg-violet-200 transition-colors">
                  <PhoneCall className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Call Coaching</p>
                  <p className="text-xs text-gray-500">Grading insights</p>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/admin/webhook-status" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-amber-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                  <Radio className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Webhook Status</p>
                  <p className="text-xs text-gray-500">Lead delivery health</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </PageContainer>
  )
}

function LoadingSkeleton() {
  return <DashboardSkeleton />
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
