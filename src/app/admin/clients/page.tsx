export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import { Plus, RefreshCw, Globe, MapPin, Podcast, Building2, CheckCircle, AlertTriangle, Zap, FileText, ExternalLink, Rss } from 'lucide-react'
import ClientLogo from '@/components/ui/ClientLogo'
import ScheduleActions from '@/components/admin/ScheduleActions'

// Brand colors for social platforms
const PLATFORM_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  facebook: { bg: 'bg-[#1877F2]', text: 'text-white', label: 'FB' },
  instagram: { bg: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]', text: 'text-white', label: 'IG' },
  linkedin: { bg: 'bg-[#0A66C2]', text: 'text-white', label: 'in' },
  twitter: { bg: 'bg-black', text: 'text-white', label: 'X' },
  tiktok: { bg: 'bg-black', text: 'text-white', label: 'TT' },
  gbp: { bg: 'bg-[#4285F4]', text: 'text-white', label: 'G' },
  youtube: { bg: 'bg-[#FF0000]', text: 'text-white', label: 'YT' },
  bluesky: { bg: 'bg-[#0085FF]', text: 'text-white', label: 'BS' },
  threads: { bg: 'bg-black', text: 'text-white', label: 'TH' },
  reddit: { bg: 'bg-[#FF4500]', text: 'text-white', label: 'R' },
  pinterest: { bg: 'bg-[#E60023]', text: 'text-white', label: 'P' },
  telegram: { bg: 'bg-[#26A5E4]', text: 'text-white', label: 'TG' },
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
      {clients.map((client) => {
        const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
        const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
        const hasDisconnected = disconnectedPlatforms.length > 0

        return (
          <Card key={client.id} className="hover:shadow-lg transition-all duration-200">
            <CardContent className="p-4">
              {/* Header: Logo + Name + Location */}
              <div className="flex flex-col items-center text-center mb-3">
                <ClientLogo
                  logoUrl={client.logoUrl}
                  businessName={client.businessName}
                  primaryColor={client.primaryColor}
                  size="lg"
                />
                <h3 className="font-semibold text-gray-900 mt-2 leading-tight line-clamp-2 text-sm">
                  {client.businessName}
                </h3>
                <p className="text-xs text-gray-500">{client.city}, {client.state}</p>
              </div>

              {/* Status Row: Badge + Auto + Blog */}
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <StatusBadge status={client.status} />
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                    client.autoScheduleEnabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title={client.autoScheduleEnabled ? 'Autopilot ON: Content is auto-generated and published' : 'Autopilot OFF: Manual content management'}
                >
                  <Zap className="h-2.5 w-2.5" />
                  {client.autoScheduleEnabled ? 'Auto' : 'Manual'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                    client.wordpressConnected
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title={client.wordpressConnected ? 'Blog Connected: Posts auto-publish to WordPress' : 'Blog Not Connected: WordPress credentials needed'}
                >
                  {client.wordpressConnected ? <CheckCircle className="h-2.5 w-2.5" /> : <Rss className="h-2.5 w-2.5" />}
                  Blog
                </span>
              </div>

              {/* Connected Platforms with Brand Colors */}
              <div className="mb-3">
                <div className="text-[10px] text-gray-400 text-center mb-1.5">Social Accounts</div>
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  {hasDisconnected && (
                    <span
                      className="inline-flex items-center justify-center h-6 w-6 rounded bg-red-500 text-white cursor-help"
                      title={`⚠️ DISCONNECTED: ${disconnectedPlatforms.join(', ')} - reconnect in Late.dev`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                    </span>
                  )}
                  {client.socialPlatforms.slice(0, 6).map((platform: string) => {
                    const platformKey = platform.toLowerCase()
                    const style = PLATFORM_STYLES[platformKey] || { bg: 'bg-gray-500', text: 'text-white', label: platform[0].toUpperCase() }
                    const isDisconnected = disconnectedPlatforms.includes(platformKey)
                    return (
                      <span
                        key={platform}
                        className={`inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold cursor-help transition-transform hover:scale-110 ${
                          isDisconnected
                            ? 'bg-red-200 text-red-700 ring-2 ring-red-400'
                            : `${style.bg} ${style.text}`
                        }`}
                        title={isDisconnected
                          ? `${platform} DISCONNECTED - Reconnect in Late.dev to resume posting`
                          : `${platform} connected and ready to post`}
                      >
                        {style.label}
                      </span>
                    )
                  })}
                  {client.socialPlatforms.length > 6 && (
                    <span
                      className="inline-flex items-center justify-center h-6 px-1.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium cursor-help"
                      title={`More accounts: ${client.socialPlatforms.slice(6).join(', ')}`}
                    >
                      +{client.socialPlatforms.length - 6}
                    </span>
                  )}
                  {client.socialPlatforms.length === 0 && (
                    <span className="text-[10px] text-gray-400">None connected</span>
                  )}
                </div>
              </div>

              {/* Quick Links with Labels */}
              <div className="border-t border-gray-100 pt-2 mb-2">
                <div className="flex items-center justify-center gap-2">
                  {client.wordpressUrl && (
                    <a
                      href={client.wordpressUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-50 transition-colors group"
                      title="Open client website in new tab"
                    >
                      <span className="relative">
                        <Globe className="h-4 w-4 text-blue-600" />
                        <ExternalLink className="h-2 w-2 absolute -top-0.5 -right-1 text-gray-400 group-hover:text-blue-600" />
                      </span>
                      <span className="text-[9px] text-gray-500">Site</span>
                    </a>
                  )}
                  {client.googleMapsUrl && (
                    <a
                      href={client.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-50 transition-colors group"
                      title="View business location on Google Maps"
                    >
                      <span className="relative">
                        <MapPin className="h-4 w-4 text-red-600" />
                        <ExternalLink className="h-2 w-2 absolute -top-0.5 -right-1 text-gray-400 group-hover:text-red-600" />
                      </span>
                      <span className="text-[9px] text-gray-500">Map</span>
                    </a>
                  )}
                  {client.podbeanPodcastUrl && (
                    <a
                      href={client.podbeanPodcastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-50 transition-colors group"
                      title="Listen to podcast episodes on Podbean"
                    >
                      <span className="relative">
                        <Podcast className="h-4 w-4 text-purple-600" />
                        <ExternalLink className="h-2 w-2 absolute -top-0.5 -right-1 text-gray-400 group-hover:text-purple-600" />
                      </span>
                      <span className="text-[9px] text-gray-500">Podcast</span>
                    </a>
                  )}
                  {client.wrhqDirectoryUrl && (
                    <a
                      href={client.wrhqDirectoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-50 transition-colors group"
                      title="View listing on WRHQ Directory"
                    >
                      <span className="relative">
                        <Building2 className="h-4 w-4 text-orange-600" />
                        <ExternalLink className="h-2 w-2 absolute -top-0.5 -right-1 text-gray-400 group-hover:text-orange-600" />
                      </span>
                      <span className="text-[9px] text-gray-500">WRHQ</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Posts This Month */}
              <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 mb-2">
                <FileText className="h-3 w-3" />
                <span>{client._count.contentItems} posts this month</span>
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
                  <button className="w-full px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                    Edit Client
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
