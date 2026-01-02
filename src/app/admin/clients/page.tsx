export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { Plus, MoreVertical, Globe, RefreshCw, MapPin, Podcast, Building2, CheckCircle, AlertTriangle } from 'lucide-react'
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

async function ClientList() {
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
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Next
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Posts
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Social
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                WP
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Links
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.map((client: any) => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <ClientLogo
                      logoUrl={client.logoUrl}
                      businessName={client.businessName}
                      primaryColor={client.primaryColor}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate max-w-[180px]">
                        {client.businessName}
                      </p>
                      <p className="text-xs text-gray-500">{client.city}, {client.state}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge status={client.status} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {client.contentItems[0]
                    ? formatDate(client.contentItems[0].scheduledDate)
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-gray-900 font-medium">
                  {client._count.contentItems}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {(() => {
                    const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
                    const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
                    const hasDisconnected = disconnectedPlatforms.length > 0

                    return (
                      <div className="flex justify-center gap-0.5 items-center">
                        {hasDisconnected && (
                          <span
                            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-600 mr-1"
                            title={`Disconnected: ${disconnectedPlatforms.join(', ')}`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                        {client.socialPlatforms.slice(0, 3).map((platform: string) => {
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
                        {client.socialPlatforms.length > 3 && (
                          <span className="text-[10px] text-gray-500 ml-0.5">
                            +{client.socialPlatforms.length - 3}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-center">
                  {client.wordpressConnected ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    {client.wordpressUrl && (
                      <a
                        href={client.wordpressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 transition-colors"
                        title="Website"
                      >
                        <Globe className="h-4 w-4" />
                      </a>
                    )}
                    {client.googleMapsUrl && (
                      <a
                        href={client.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Google Maps"
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    )}
                    {client.podbeanPodcastUrl && (
                      <a
                        href={client.podbeanPodcastUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-500 hover:text-purple-700 transition-colors"
                        title="Podbean Podcast"
                      >
                        <Podcast className="h-4 w-4" />
                      </a>
                    )}
                    {client.wrhqDirectoryUrl && (
                      <a
                        href={client.wrhqDirectoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-500 hover:text-orange-700 transition-colors"
                        title="WRHQ Directory"
                      >
                        <Building2 className="h-4 w-4" />
                      </a>
                    )}
                    {!client.wordpressUrl && !client.googleMapsUrl && !client.podbeanPodcastUrl && !client.wrhqDirectoryUrl && (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ScheduleActions
                      clientId={client.id}
                      clientName={client.businessName}
                      hasSchedule={client.calendarGenerated}
                      scheduledCount={client.scheduledCount}
                    />
                    <Link href={`/admin/clients/${client.id}`}>
                      <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7">
                        Edit
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="px-1 py-1 h-7">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
          <ClientList />
        </Suspense>
      </div>
    </div>
  )
}
