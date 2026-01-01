import { Suspense } from 'react'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import { formatDateTime } from '@/lib/utils'
import {
  Users,
  Calendar,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

async function getStats() {
  const [
    activeClients,
    scheduledThisWeek,
    publishedToday,
    failedItems,
    recentActivity,
    upcomingContent,
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
        client: { select: { businessName: true } },
        contentItem: { select: { paaQuestion: true } },
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
        client: { select: { businessName: true } },
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
  }
}

function StatCard({
  title,
  value,
  icon: Icon,
  alert = false,
}: {
  title: string
  value: number
  icon: React.ElementType
  alert?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className={`rounded-full p-3 ${alert ? 'bg-red-100' : 'bg-blue-100'}`}>
          <Icon className={`h-6 w-6 ${alert ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-2xl font-bold ${alert && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

async function DashboardContent() {
  const stats = await getStats()

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Active Clients"
          value={stats.activeClients}
          icon={Users}
        />
        <StatCard
          title="Scheduled This Week"
          value={stats.scheduledThisWeek}
          icon={Calendar}
        />
        <StatCard
          title="Published Today"
          value={stats.publishedToday}
          icon={CheckCircle}
        />
        <StatCard
          title="Failed Items"
          value={stats.failedItems}
          icon={AlertCircle}
          alert
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {stats.recentActivity.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-500'
                          : log.status === 'FAILED'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {log.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {log.client?.businessName} - {log.contentItem?.paaQuestion?.substring(0, 50)}...
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(log.startedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Content */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Content</CardTitle>
            <Link
              href="/admin/content"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {stats.upcomingContent.length === 0 ? (
              <p className="text-gray-500 text-sm">No upcoming content scheduled</p>
            ) : (
              <div className="space-y-4">
                {stats.upcomingContent.map((item: { id: string; paaQuestion: string; scheduledDate: string; status: string; client: { businessName: string } }) => (
                  <div key={item.id} className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.paaQuestion}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.client.businessName}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(item.scheduledDate)}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" subtitle="Overview of your content automation" />
      <div className="flex-1 p-6 overflow-auto">
        <Suspense fallback={<div>Loading...</div>}>
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  )
}
