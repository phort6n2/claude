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
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              {/* Header: Logo + Name + Status */}
              <div className="flex items-start gap-3 mb-3">
                <ClientLogo
                  logoUrl={client.logoUrl}
                  businessName={client.businessName}
                  primaryColor={client.primaryColor}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm truncate" title={client.businessName}>
                    {client.businessName}
                  </h3>
                  <p className="text-xs text-gray-500">{client.city}, {client.state}</p>
                  <div className="mt-1">
                    <StatusBadge status={client.status} />
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 mb-3 text-xs">
                <div className="flex items-center gap-1" title="Posts this month">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium text-gray-700">{client._count.contentItems}</span>
                </div>
                <div className="flex items-center gap-1" title={client.autoScheduleEnabled ? 'Auto-schedule ON' : 'Auto-schedule OFF'}>
                  <Zap className={`h-3.5 w-3.5 ${client.autoScheduleEnabled ? 'text-green-500' : 'text-gray-300'}`} />
                  <span className={client.autoScheduleEnabled ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {client.autoScheduleEnabled ? 'Auto' : 'Off'}
                  </span>
                </div>
                <div className="flex items-center gap-1" title={client.wordpressConnected ? 'WordPress connected' : 'WordPress not connected'}>
                  {client.wordpressConnected ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-gray-300" />
                  )}
                  <span className={client.wordpressConnected ? 'text-green-600' : 'text-gray-400'}>WP</span>
                </div>
              </div>

              {/* Social Platforms */}
              <div className="flex items-center gap-1 mb-3">
                {hasDisconnected && (
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-600"
                    title={`Disconnected: ${disconnectedPlatforms.join(', ')}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                )}
                {client.socialPlatforms.slice(0, 4).map((platform: string) => {
                  const isDisconnected = disconnectedPlatforms.includes(platform.toLowerCase())
                  return (
                    <span
                      key={platform}
                      className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-medium ${
                        isDisconnected
                          ? 'bg-red-100 text-red-600 ring-1 ring-red-300'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                      title={isDisconnected ? `${platform} (DISCONNECTED)` : platform}
                    >
                      {platform[0].toUpperCase()}
                    </span>
                  )
                })}
                {client.socialPlatforms.length > 4 && (
                  <span className="text-[10px] text-gray-500">
                    +{client.socialPlatforms.length - 4}
                  </span>
                )}
                {client.socialPlatforms.length === 0 && (
                  <span className="text-xs text-gray-400">No social accounts</span>
                )}
              </div>

              {/* Quick Links */}
              <div className="flex items-center gap-2 mb-3 border-t pt-3">
                {client.wordpressUrl && (
                  <a
                    href={client.wordpressUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    title="Website"
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </a>
                )}
                {client.googleMapsUrl && (
                  <a
                    href={client.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="Google Maps"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </a>
                )}
                {client.podbeanPodcastUrl && (
                  <a
                    href={client.podbeanPodcastUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                    title="Podcast"
                  >
                    <Podcast className="h-3.5 w-3.5" />
                  </a>
                )}
                {client.wrhqDirectoryUrl && (
                  <a
                    href={client.wrhqDirectoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                    title="WRHQ Directory"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </a>
                )}
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
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Edit
                  </Button>
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
