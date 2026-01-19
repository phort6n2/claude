export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import {
  Plus,
  RefreshCw,
  Globe,
  MapPin,
  Podcast,
  Building2,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  ExternalLink,
  Rss,
  Users,
  TrendingUp,
  Calendar,
  MoreVertical,
  Settings,
  BarChart3,
  Search,
  Filter,
  ArrowUpRight,
  Sparkles,
  Clock,
  Activity,
} from 'lucide-react'
import ClientLogo from '@/components/ui/ClientLogo'
import ScheduleActions from '@/components/admin/ScheduleActions'

// Brand colors for social platforms
const PLATFORM_STYLES: Record<string, { bg: string; text: string; label: string; hover: string }> = {
  facebook: { bg: 'bg-[#1877F2]', text: 'text-white', label: 'FB', hover: 'hover:bg-[#166FE5]' },
  instagram: { bg: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]', text: 'text-white', label: 'IG', hover: '' },
  linkedin: { bg: 'bg-[#0A66C2]', text: 'text-white', label: 'in', hover: 'hover:bg-[#094D92]' },
  twitter: { bg: 'bg-black', text: 'text-white', label: 'X', hover: 'hover:bg-gray-800' },
  tiktok: { bg: 'bg-black', text: 'text-white', label: 'TT', hover: 'hover:bg-gray-800' },
  gbp: { bg: 'bg-[#4285F4]', text: 'text-white', label: 'G', hover: 'hover:bg-[#3B78E7]' },
  youtube: { bg: 'bg-[#FF0000]', text: 'text-white', label: 'YT', hover: 'hover:bg-[#E60000]' },
  bluesky: { bg: 'bg-[#0085FF]', text: 'text-white', label: 'BS', hover: 'hover:bg-[#0077E6]' },
  threads: { bg: 'bg-black', text: 'text-white', label: 'TH', hover: 'hover:bg-gray-800' },
  reddit: { bg: 'bg-[#FF4500]', text: 'text-white', label: 'R', hover: 'hover:bg-[#E63E00]' },
  pinterest: { bg: 'bg-[#E60023]', text: 'text-white', label: 'P', hover: 'hover:bg-[#CC001F]' },
  telegram: { bg: 'bg-[#26A5E4]', text: 'text-white', label: 'TG', hover: 'hover:bg-[#229ED9]' },
}

async function getClients() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          contentItems: {
            where: {
              status: 'PUBLISHED',
              publishedAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              },
            },
          },
        },
      },
      contentItems: {
        where: { status: { in: ['SCHEDULED', 'GENERATING'] } },
        orderBy: { scheduledDate: 'asc' },
        take: 1,
        select: { scheduledDate: true, status: true },
      },
    },
  })

  // Get scheduled counts separately since Prisma doesn't support multiple _count conditions
  const scheduledCounts = await prisma.contentItem.groupBy({
    by: ['clientId'],
    where: {
      status: {
        in: ['DRAFT', 'SCHEDULED'],
      },
    },
    _count: { id: true },
  })

  const countMap = new Map(scheduledCounts.map(c => [c.clientId, c._count.id]))

  return clients.map(client => ({
    ...client,
    scheduledCount: countMap.get(client.id) || 0,
  }))
}

async function getStats() {
  const [total, active, autoEnabled, postsThisMonth] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { status: 'ACTIVE' } }),
    prisma.client.count({ where: { autoScheduleEnabled: true } }),
    prisma.contentItem.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ])
  return { total, active, autoEnabled, postsThisMonth }
}

function StatsBar({ stats }: { stats: { total: number; active: number; autoEnabled: number; postsThisMonth: number } }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">Total Clients</p>
            <p className="text-3xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <Users className="h-6 w-6" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Active</p>
            <p className="text-3xl font-bold mt-1">{stats.active}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <Activity className="h-6 w-6" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-violet-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-violet-100 text-sm font-medium">On Autopilot</p>
            <p className="text-3xl font-bold mt-1">{stats.autoEnabled}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <Sparkles className="h-6 w-6" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-amber-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100 text-sm font-medium">Posts This Month</p>
            <p className="text-3xl font-bold mt-1">{stats.postsThisMonth}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

async function ClientCards() {
  const [clients, stats] = await Promise.all([getClients(), getStats()])

  if (clients.length === 0) {
    return (
      <>
        <StatsBar stats={stats} />
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="bg-blue-50 rounded-full p-4 mb-4">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No clients yet</h3>
            <p className="text-gray-500 mb-6 text-center max-w-md">
              Get started by adding your first auto glass shop client. You&apos;ll be able to manage their content, social media, and more.
            </p>
            <Link href="/admin/clients/new">
              <Button size="lg" className="shadow-lg shadow-blue-500/25">
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Client
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <StatsBar stats={stats} />

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients by name or location..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
              <Filter className="h-4 w-4" />
              Filters
            </button>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button className="px-3 py-2.5 bg-blue-50 text-blue-600 border-r border-gray-200">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              </button>
              <button className="px-3 py-2.5 text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                  <rect x="1" y="1" width="14" height="3" rx="1" />
                  <rect x="1" y="6" width="14" height="3" rx="1" />
                  <rect x="1" y="11" width="14" height="3" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Client Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {clients.map((client) => {
          const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
          const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
          const hasDisconnected = disconnectedPlatforms.length > 0
          const nextContent = client.contentItems[0]
          const isGenerating = nextContent?.status === 'GENERATING'

          // Determine health status
          const hasConnections = client.socialPlatforms.length > 0 || client.wordpressConnected
          const isHealthy = client.status === 'ACTIVE' && !hasDisconnected && hasConnections

          return (
            <div
              key={client.id}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300 overflow-hidden"
            >
              {/* Status Bar */}
              <div className={`h-1.5 ${
                isHealthy
                  ? client.autoScheduleEnabled
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                    : 'bg-gradient-to-r from-blue-400 to-indigo-400'
                  : hasDisconnected
                    ? 'bg-gradient-to-r from-red-400 to-orange-400'
                    : 'bg-gradient-to-r from-gray-300 to-gray-400'
              }`} />

              <div className="p-5">
                {/* Header Row */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative">
                    <ClientLogo
                      logoUrl={client.logoUrl}
                      businessName={client.businessName}
                      primaryColor={client.primaryColor}
                      size="lg"
                    />
                    {client.autoScheduleEnabled && (
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 ring-2 ring-white">
                        <Zap className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {client.businessName}
                    </h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {client.city}, {client.state}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gray-100 rounded-lg"
                    title="Client Settings"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                  </Link>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <StatusBadge status={client.status} />
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      client.autoScheduleEnabled
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'
                    }`}
                  >
                    {client.autoScheduleEnabled ? (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Autopilot
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3" />
                        Manual
                      </>
                    )}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      client.wordpressConnected
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'
                    }`}
                  >
                    {client.wordpressConnected ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <Rss className="h-3 w-3" />
                    )}
                    Blog
                  </span>
                </div>

                {/* Social Accounts */}
                <div className="mb-4">
                  <div className="text-xs font-medium text-gray-500 mb-2">Connected Accounts</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {hasDisconnected && (
                      <span
                        className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-red-100 text-red-600 cursor-help ring-1 ring-red-200"
                        title={`⚠️ Disconnected: ${disconnectedPlatforms.join(', ')}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {client.socialPlatforms.slice(0, 5).map((platform: string) => {
                      const platformKey = platform.toLowerCase()
                      const style = PLATFORM_STYLES[platformKey] || { bg: 'bg-gray-500', text: 'text-white', label: platform[0].toUpperCase(), hover: '' }
                      const isDisconnected = disconnectedPlatforms.includes(platformKey)
                      return (
                        <span
                          key={platform}
                          className={`inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold cursor-help transition-all hover:scale-110 ${
                            isDisconnected
                              ? 'bg-red-50 text-red-600 ring-2 ring-red-300'
                              : `${style.bg} ${style.text} ${style.hover}`
                          }`}
                          title={isDisconnected ? `${platform} disconnected` : platform}
                        >
                          {style.label}
                        </span>
                      )
                    })}
                    {client.socialPlatforms.length > 5 && (
                      <span className="inline-flex items-center justify-center h-7 px-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                        +{client.socialPlatforms.length - 5}
                      </span>
                    )}
                    {client.socialPlatforms.length === 0 && (
                      <span className="text-xs text-gray-400 italic">No accounts connected</span>
                    )}
                  </div>
                </div>

                {/* Quick Links */}
                <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-4 border-b border-gray-100">
                  {client.wordpressUrl && (
                    <a
                      href={client.wordpressUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      Web
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  )}
                  {client.googleMapsUrl && (
                    <a
                      href={client.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <MapPin className="h-3 w-3" />
                      Map
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  )}
                  {client.podbeanPodcastUrl && (
                    <a
                      href={client.podbeanPodcastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors"
                    >
                      <Podcast className="h-3 w-3" />
                      Pod
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  )}
                  {client.wrhqDirectoryUrl && (
                    <a
                      href={client.wrhqDirectoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors"
                    >
                      <Building2 className="h-3 w-3" />
                      WRHQ
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  )}
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-white rounded-lg p-1.5 shadow-sm">
                        <FileText className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{client._count.contentItems}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">This Month</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-1.5 shadow-sm ${isGenerating ? 'bg-amber-100' : 'bg-white'}`}>
                        <Calendar className={`h-4 w-4 ${isGenerating ? 'text-amber-500' : 'text-emerald-500'}`} />
                      </div>
                      <div>
                        {nextContent ? (
                          <>
                            <p className="text-sm font-semibold text-gray-900">
                              {isGenerating ? 'Now' : new Date(nextContent.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                              {isGenerating ? 'Generating' : 'Next Post'}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-gray-400">—</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">No Scheduled</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <ScheduleActions
                    clientId={client.id}
                    clientName={client.businessName}
                    hasSchedule={client.calendarGenerated}
                    scheduledCount={client.scheduledCount}
                  />
                  <Link href={`/admin/clients/${client.id}`} className="flex-1">
                    <button className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 rounded-xl transition-all duration-200 flex items-center justify-center gap-2">
                      <Settings className="h-4 w-4" />
                      Manage
                    </button>
                  </Link>
                  <Link
                    href={`/admin/content?client=${client.id}`}
                    className="px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200 flex items-center gap-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Content
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-gray-200 rounded-2xl h-28" />
        ))}
      </div>
      {/* Search bar skeleton */}
      <div className="bg-gray-200 rounded-xl h-16 mb-6" />
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="bg-gray-200 rounded-2xl h-96" />
        ))}
      </div>
    </div>
  )
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <Header
        title="Clients"
        subtitle="Manage your auto glass shop clients"
      />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-[1800px] mx-auto">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">All Clients</h2>
              <p className="text-gray-500 text-sm mt-1">
                View and manage all your auto glass shop clients in one place
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="shadow-sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Link href="/admin/clients/new">
                <Button className="shadow-lg shadow-blue-500/25">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </Link>
            </div>
          </div>

          <Suspense fallback={<LoadingSkeleton />}>
            <ClientCards />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
