'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  LayoutGrid,
  List,
  MapPin,
  Globe,
  Podcast,
  Building2,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  Calendar,
  Settings,
  BarChart3,
  ArrowUpRight,
  Sparkles,
  Clock,
  ChevronUp,
  ChevronDown,
  Rss,
  ExternalLink,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
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

interface Client {
  id: string
  businessName: string
  slug: string
  city: string | null
  state: string | null
  status: string
  logoUrl: string | null
  primaryColor: string | null
  wordpressUrl: string | null
  wordpressConnected: boolean
  googleMapsUrl: string | null
  podbeanPodcastUrl: string | null
  wrhqDirectoryUrl: string | null
  autoScheduleEnabled: boolean
  calendarGenerated: boolean
  socialPlatforms: string[]
  disconnectedAccounts: unknown
  scheduledCount: number
  _count: {
    contentItems: number
  }
  contentItems: Array<{
    scheduledDate: string
    status: string
  }>
}

type SortKey = 'name' | 'status' | 'nextPost' | 'postsThisMonth'
type SortDirection = 'asc' | 'desc'

interface ClientsListViewProps {
  clients: Client[]
}

export default function ClientsListView({ clients }: ClientsListViewProps) {
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const filteredAndSortedClients = useMemo(() => {
    let result = [...clients]

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        client =>
          client.businessName.toLowerCase().includes(searchLower) ||
          client.city?.toLowerCase().includes(searchLower) ||
          client.state?.toLowerCase().includes(searchLower)
      )
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortKey) {
        case 'name':
          comparison = a.businessName.localeCompare(b.businessName)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'nextPost':
          const aDate = a.contentItems[0]?.scheduledDate
          const bDate = b.contentItems[0]?.scheduledDate
          if (!aDate && !bDate) comparison = 0
          else if (!aDate) comparison = 1
          else if (!bDate) comparison = -1
          else comparison = new Date(aDate).getTime() - new Date(bDate).getTime()
          break
        case 'postsThisMonth':
          comparison = a._count.contentItems - b._count.contentItems
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [clients, search, sortKey, sortDirection])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )
  }

  return (
    <div>
      {/* Search and View Toggle */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients by name or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 mr-2">{filteredAndSortedClients.length} clients</span>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setView('table')}
                className={`px-3 py-2 transition-colors ${
                  view === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('cards')}
                className={`px-3 py-2 transition-colors ${
                  view === 'cards' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-4">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Client
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-4">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Status
                      <SortIcon column="status" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-4">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Platforms
                    </span>
                  </th>
                  <th className="text-left px-4 py-4">
                    <button
                      onClick={() => handleSort('nextPost')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Next Post
                      <SortIcon column="nextPost" />
                    </button>
                  </th>
                  <th className="text-center px-4 py-4">
                    <button
                      onClick={() => handleSort('postsThisMonth')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      This Month
                      <SortIcon column="postsThisMonth" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-4">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Quick Links
                    </span>
                  </th>
                  <th className="text-right px-6 py-4">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedClients.map((client) => {
                  const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
                  const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
                  const hasDisconnected = disconnectedPlatforms.length > 0
                  const nextContent = client.contentItems[0]
                  const isGenerating = nextContent?.status === 'GENERATING'

                  return (
                    <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Client */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <ClientLogo
                              logoUrl={client.logoUrl}
                              businessName={client.businessName}
                              primaryColor={client.primaryColor}
                              size="sm"
                            />
                            {client.autoScheduleEnabled && (
                              <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 ring-2 ring-white">
                                <Zap className="h-2 w-2 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/clients/${client.id}`}
                              className="font-medium text-gray-900 hover:text-blue-600 transition-colors truncate block"
                            >
                              {client.businessName}
                            </Link>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {client.city}, {client.state}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={client.status} />
                          {client.autoScheduleEnabled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                              <Sparkles className="h-3 w-3" />
                              Autopilot
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Platforms */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {hasDisconnected && (
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-red-100 text-red-600 cursor-help"
                              title={`Disconnected: ${disconnectedPlatforms.join(', ')}`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                          {client.wordpressConnected && (
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-100 text-blue-600"
                              title="WordPress connected"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </span>
                          )}
                          {client.socialPlatforms.slice(0, 4).map((platform: string) => {
                            const platformKey = platform.toLowerCase()
                            const style = PLATFORM_STYLES[platformKey] || { bg: 'bg-gray-500', text: 'text-white', label: platform[0].toUpperCase(), hover: '' }
                            const isDisconnected = disconnectedPlatforms.includes(platformKey)
                            return (
                              <span
                                key={platform}
                                className={`inline-flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold ${
                                  isDisconnected
                                    ? 'bg-red-50 text-red-600 ring-1 ring-red-300'
                                    : `${style.bg} ${style.text}`
                                }`}
                                title={isDisconnected ? `${platform} disconnected` : platform}
                              >
                                {style.label}
                              </span>
                            )
                          })}
                          {client.socialPlatforms.length > 4 && (
                            <span className="inline-flex items-center justify-center h-6 px-1.5 rounded-md bg-gray-100 text-gray-600 text-[10px] font-medium">
                              +{client.socialPlatforms.length - 4}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Next Post */}
                      <td className="px-4 py-4">
                        {nextContent ? (
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${isGenerating ? 'bg-amber-100' : 'bg-gray-100'}`}>
                              <Calendar className={`h-3.5 w-3.5 ${isGenerating ? 'text-amber-600' : 'text-gray-500'}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {isGenerating ? 'Generating...' : new Date(nextContent.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>

                      {/* Posts This Month */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700">
                          {client._count.contentItems}
                        </span>
                      </td>

                      {/* Quick Links */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {client.wordpressUrl && (
                            <a
                              href={client.wordpressUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
                              className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                              title="Podcast"
                            >
                              <Podcast className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <ScheduleActions
                            clientId={client.id}
                            clientName={client.businessName}
                            hasSchedule={client.calendarGenerated}
                            scheduledCount={client.scheduledCount}
                          />
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Manage
                          </Link>
                          <Link
                            href={`/admin/content?client=${client.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                            Content
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card View */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredAndSortedClients.map((client) => {
            const disconnected = client.disconnectedAccounts as Record<string, unknown> | null
            const disconnectedPlatforms = disconnected ? Object.keys(disconnected) : []
            const hasDisconnected = disconnectedPlatforms.length > 0
            const nextContent = client.contentItems[0]
            const isGenerating = nextContent?.status === 'GENERATING'
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
                          title={`Disconnected: ${disconnectedPlatforms.join(', ')}`}
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
      )}
    </div>
  )
}
