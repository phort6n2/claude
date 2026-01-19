export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatDateTime } from '@/lib/utils'
import {
  Users,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Activity,
  Clock,
  ArrowRight,
  FileText,
  TrendingUp,
  Zap,
  BarChart3,
  Settings,
  ExternalLink,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
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
  const [
    activeClients,
    scheduledThisWeek,
    publishedToday,
    failedItems,
    recentActivity,
    upcomingContent,
    totalPublishedThisMonth,
  ] = await Promise.all([
    prisma.client.count({ where: { status: 'ACTIVE' } }),
    prisma.contentItem.count({
      where: {
        status: 'SCHEDULED',
        scheduledDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.contentItem.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.contentItem.count({ where: { status: 'FAILED' } }),
    prisma.publishingLog.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
      include: {
        client: { select: { businessName: true, id: true } },
        contentItem: { select: { paaQuestion: true, id: true } },
      },
    }),
    prisma.contentItem.findMany({
      where: {
        status: { in: ['SCHEDULED', 'GENERATING'] },
        scheduledDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      take: 10,
      orderBy: { scheduledDate: 'asc' },
      include: {
        client: { select: { businessName: true, id: true } },
      },
    }),
    prisma.contentItem.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ])

  return {
    activeClients,
    scheduledThisWeek,
    publishedToday,
    failedItems,
    recentActivity,
    upcomingContent,
    totalPublishedThisMonth,
  }
}

async function DashboardContent() {
  const stats = await getStats()

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your content automation"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/monitoring"
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-all shadow-sm"
            >
              <BarChart3 className="h-4 w-4" />
              Monitoring
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
          subtitle="With content automation"
          icon={<Users />}
          variant="blue"
        />
        <GradientStatCard
          title="Scheduled This Week"
          value={stats.scheduledThisWeek}
          subtitle="Upcoming content"
          icon={<Calendar />}
          variant="violet"
        />
        <GradientStatCard
          title="Published Today"
          value={stats.publishedToday}
          subtitle="Content pieces"
          icon={<CheckCircle />}
          variant="green"
        />
        <NeutralStatCard
          title="Failed Items"
          value={stats.failedItems}
          subtitle={stats.failedItems === 0 ? 'All systems healthy' : 'Need attention'}
          icon={<AlertTriangle />}
          isAlert={stats.failedItems > 0}
        />
      </StatCardGrid>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-cyan-50 to-white rounded-2xl p-5 border border-cyan-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-100 rounded-xl">
              <TrendingUp className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPublishedThisMonth}</p>
              <p className="text-sm text-gray-500">Published this month</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl p-5 border border-amber-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <Zap className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.upcomingContent.filter(c => c.status === 'GENERATING').length}</p>
              <p className="text-sm text-gray-500">Currently generating</p>
            </div>
          </div>
        </div>
        <Link href="/admin/content" className="group">
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-5 border border-indigo-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-xl">
                  <FileText className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">View All Content</p>
                  <p className="text-xs text-gray-500">Manage content library</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <ContentCard padding="none">
          <ContentCardHeader
            title="Recent Activity"
            icon={<Activity />}
            actions={
              <Link
                href="/admin/monitoring"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {stats.recentActivity.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="No recent activity"
              description="Activity will appear here as content is processed"
            />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {stats.recentActivity.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-100'
                          : log.status === 'FAILED'
                            ? 'bg-red-100'
                            : 'bg-yellow-100'
                      }`}
                    >
                      {log.status === 'SUCCESS' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : log.status === 'FAILED' ? (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {log.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {log.client && (
                          <Link
                            href={`/admin/clients/${log.client.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {log.client.businessName}
                          </Link>
                        )}
                        {log.contentItem?.paaQuestion && (
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            {log.contentItem.paaQuestion}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(log.startedAt)}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-100 text-green-700'
                          : log.status === 'FAILED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ContentCard>

        {/* Upcoming Content */}
        <ContentCard padding="none">
          <ContentCardHeader
            title="Upcoming Content"
            icon={<Calendar />}
            actions={
              <Link
                href="/admin/content"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {stats.upcomingContent.length === 0 ? (
            <EmptyState
              icon={<Calendar />}
              title="No upcoming content"
              description="Schedule content to see it here"
            />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {stats.upcomingContent.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/content/${item.id}/review`}
                  className="p-4 hover:bg-gray-50 transition-colors block group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.status === 'GENERATING' ? 'bg-amber-100' : 'bg-blue-100'
                        }`}
                      >
                        {item.status === 'GENERATING' ? (
                          <Zap className="h-4 w-4 text-amber-600" />
                        ) : (
                          <FileText className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {item.paaQuestion}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.client.businessName}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(item.scheduledDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <ExternalLink className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
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
          <Link href="/admin/content/new" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Create Content</p>
                  <p className="text-xs text-gray-500">New blog post</p>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/admin/paa-library" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-violet-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg group-hover:bg-violet-200 transition-colors">
                  <BarChart3 className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">PAA Library</p>
                  <p className="text-xs text-gray-500">Browse questions</p>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/admin/reports/daily" className="group">
            <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-amber-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Daily Report</p>
                  <p className="text-xs text-gray-500">View analytics</p>
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
