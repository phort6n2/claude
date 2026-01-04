export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import { Plus, RefreshCw, Globe, MapPin, Podcast, Building2, CheckCircle, AlertTriangle, Calendar, Zap, FileText } from 'lucide-react'
import ClientLogo from '@/components/ui/ClientLogo'
import ScheduleActions from '@/components/admin/ScheduleActions'

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
        where: { status: 'SCHEDULED' },
        orderBy: { scheduledDate: 'asc' },
        take: 1,
        select: { scheduledDate: true },
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

async function ClientCards() {
  const clients = await getClients()

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-gray-500 mb-4">No clients yet</p>
          <Link href="/admin/clients/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Client
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {clients.map((client) => {
        const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
        const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
        const hasDisconnected = disconnectedPlatforms.length > 0

        return (
          <Card key={client.id} className="hover:shadow-lg transition-all duration-200 group">
            <CardContent className="p-5">
              {/* Centered Header */}
              <div className="flex flex-col items-center text-center mb-4">
                <ClientLogo
                  logoUrl={client.logoUrl}
                  businessName={client.businessName}
                  primaryColor={client.primaryColor}
                  size="lg"
                />
                <h3 className="font-semibold text-gray-900 mt-3 leading-tight line-clamp-2 min-h-[2.5rem]">
                  {client.businessName}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">{client.city}, {client.state}</p>
                <div className="mt-2">
                  <StatusBadge status={client.status} />
                </div>
              </div>

              {/* Status Indicators - Centered Pills */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    client.autoScheduleEnabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title={client.autoScheduleEnabled ? 'Auto-scheduling is enabled' : 'Auto-scheduling is disabled'}
                >
                  <Zap className="h-3 w-3" />
                  {client.autoScheduleEnabled ? 'Auto' : 'Manual'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    client.wordpressConnected
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title={client.wordpressConnected ? 'WordPress is connected and publishing' : 'WordPress not connected'}
                >
                  {client.wordpressConnected ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-current opacity-50" />
                  )}
                  WP
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                  title={`${client._count.contentItems} posts published this month`}
                >
                  <FileText className="h-3 w-3" />
                  {client._count.contentItems}
                </span>
              </div>

              {/* Social Platforms - Centered */}
              <div className="flex items-center justify-center gap-1.5 mb-4">
                {hasDisconnected && (
                  <span
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-100 text-red-600 cursor-help"
                    title={`⚠️ Disconnected accounts: ${disconnectedPlatforms.join(', ')}`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                )}
                {client.socialPlatforms.slice(0, 5).map((platform: string) => {
                  const isDisconnected = disconnectedPlatforms.includes(platform.toLowerCase())
                  return (
                    <span
                      key={platform}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold cursor-help transition-transform hover:scale-110 ${
                        isDisconnected
                          ? 'bg-red-100 text-red-600 ring-2 ring-red-200'
                          : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700'
                      }`}
                      title={isDisconnected ? `${platform} - ⚠️ DISCONNECTED` : `${platform} - Connected`}
                    >
                      {platform[0].toUpperCase()}
                    </span>
                  )
                })}
                {client.socialPlatforms.length > 5 && (
                  <span
                    className="text-xs text-gray-500 font-medium cursor-help"
                    title={`Also connected: ${client.socialPlatforms.slice(5).join(', ')}`}
                  >
                    +{client.socialPlatforms.length - 5}
                  </span>
                )}
                {client.socialPlatforms.length === 0 && (
                  <span className="text-xs text-gray-400 italic">No social accounts</span>
                )}
              </div>

              {/* Quick Links - Centered with labels on hover */}
              <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-100">
                {client.wordpressUrl && (
                  <a
                    href={client.wordpressUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-all"
                    title="🌐 Visit Website"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}
                {client.googleMapsUrl && (
                  <a
                    href={client.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:scale-110 transition-all"
                    title="📍 View on Google Maps"
                  >
                    <MapPin className="h-4 w-4" />
                  </a>
                )}
                {client.podbeanPodcastUrl && (
                  <a
                    href={client.podbeanPodcastUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 hover:scale-110 transition-all"
                    title="🎙️ Listen to Podcast"
                  >
                    <Podcast className="h-4 w-4" />
                  </a>
                )}
                {client.wrhqDirectoryUrl && (
                  <a
                    href={client.wrhqDirectoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 hover:scale-110 transition-all"
                    title="🏢 WRHQ Directory Listing"
                  >
                    <Building2 className="h-4 w-4" />
                  </a>
                )}
                {!client.wordpressUrl && !client.googleMapsUrl && !client.podbeanPodcastUrl && !client.wrhqDirectoryUrl && (
                  <span className="text-xs text-gray-400 italic">No quick links</span>
                )}
              </div>

              {/* Actions - Compact */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <ScheduleActions
                  clientId={client.id}
                  clientName={client.businessName}
                  hasSchedule={client.calendarGenerated}
                  scheduledCount={client.scheduledCount}
                />
                <Link href={`/admin/clients/${client.id}`}>
                  <button className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
                    Edit
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Clients" subtitle="Manage your auto glass shop clients" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          <Link href="/admin/clients/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </Link>
        </div>
        <Suspense fallback={<div>Loading clients...</div>}>
          <ClientCards />
        </Suspense>
      </div>
    </div>
  )
}
