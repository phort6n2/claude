'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'
import {
  Calendar as CalendarIcon,
  List,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Eye,
  Trash2,
  FileText,
  Images,
  Share2,
  Mic,
  Video,
  Film,
  Code,
  Link2,
  Plus,
  Filter,
  Search,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import {
  PageContainer,
  PageHeader,
  GradientStatCard,
  NeutralStatCard,
  StatCardGrid,
  ContentCard,
  ListPageSkeleton,
} from '@/components/ui/theme'

type ViewMode = 'month' | 'list' | 'timeline'

interface ContentItem {
  id: string
  paaQuestion: string
  scheduledDate: string
  scheduledTime: string
  status: string
  pipelineStep: string | null
  needsAttention: boolean
  completionPercent: number
  blogApproved: string
  imagesApproved: string
  socialApproved: string
  blogGenerated: boolean
  imagesGenerated: boolean
  socialGenerated: boolean
  podcastGenerated: boolean
  podcastStatus: string | null
  shortVideoGenerated: boolean
  shortVideoStatus: string | null
  longformVideoUrl: string | null
  schemaGenerated: boolean
  podcastAddedToPost: boolean
  shortVideoAddedToPost: boolean
  longVideoAddedToPost: boolean
  serviceLocation: {
    city: string
    state: string
    neighborhood: string | null
  } | null
  client: {
    id: string
    businessName: string
    primaryColor: string | null
  }
  blogPost?: {
    wordpressPostId: number | null
    schemaJson: string | null
  } | null
  podcast?: {
    podbeanUrl: string | null
  } | null
  socialPosts?: Array<{
    id: string
    platform: string
    publishedUrl: string | null
  }>
  shortFormVideos?: Array<{
    id: string
    publishedUrls: Record<string, string> | null
  }>
}

interface Client {
  id: string
  businessName: string
}

export default function ContentCalendarPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string>('all')

  const fetchContent = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedClient !== 'all') params.append('clientId', selectedClient)

      const response = await fetch(`/api/content?${params}`)
      const data = await response.json()

      setContentItems(data)
    } catch (error) {
      console.error('Failed to fetch content:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [selectedClient])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (selectedClient !== 'all') params.append('clientId', selectedClient)

      const response = await fetch(`/api/content?${params}`)
      const data = await response.json()

      setContentItems(data)
    } catch (error) {
      console.error('Failed to fetch content:', error)
    } finally {
      setRefreshing(false)
    }
  }, [selectedClient])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(console.error)
  }, [])

  // Auto-refresh when there are GENERATING items (silent refresh, no loading flash)
  useEffect(() => {
    const hasGenerating = contentItems.some(item => item.status === 'GENERATING')
    if (!hasGenerating) return

    const interval = setInterval(() => {
      fetchContent(false) // Silent refresh - no loading indicator
    }, 10000) // Refresh every 10 seconds

    return () => clearInterval(interval)
  }, [contentItems, fetchContent])

  const handleDeleteContent = async (id: string, question: string) => {
    if (!confirm(`Delete this content item?\n\n"${question.substring(0, 60)}${question.length > 60 ? '...' : ''}"\n\nThis cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/content/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setContentItems(prev => prev.filter(item => item.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete content:', error)
    }
  }

  // Stats calculations
  const stats = {
    total: contentItems.length,
    published: contentItems.filter(i => i.status === 'PUBLISHED').length,
    generating: contentItems.filter(i => i.status === 'GENERATING').length,
    scheduled: contentItems.filter(i => i.status === 'SCHEDULED').length,
    failed: contentItems.filter(i => i.status === 'FAILED').length,
    needsAttention: contentItems.filter(i => i.needsAttention).length,
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = []

    const startDay = firstDay.getDay()
    for (let i = 0; i < startDay; i++) {
      days.push(null)
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const getContentForDate = (date: Date) => {
    return contentItems.filter((item) => {
      const itemDate = new Date(item.scheduledDate)
      return (
        itemDate.getFullYear() === date.getFullYear() &&
        itemDate.getMonth() === date.getMonth() &&
        itemDate.getDate() === date.getDate()
      )
    })
  }

  if (loading) {
    return <ListPageSkeleton />
  }

  const renderMonthView = () => {
    const days = getDaysInMonth(currentMonth)
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
      <ContentCard padding="none">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                )
              }
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {currentMonth.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                )
              }
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {weekDays.map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center text-xs font-semibold text-gray-600 uppercase"
              >
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div
                key={index}
                className={`min-h-28 bg-white p-2 ${
                  day ? 'hover:bg-gray-50 transition-colors' : 'bg-gray-50'
                }`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-medium ${
                      day.toDateString() === new Date().toDateString()
                        ? 'text-blue-600'
                        : 'text-gray-500'
                    }`}>
                      {day.getDate()}
                    </div>
                    <div className="mt-1 space-y-1">
                      {getContentForDate(day)
                        .slice(0, 3)
                        .map((item) => (
                          <Link
                            key={item.id}
                            href={`/admin/content/${item.id}/review`}
                            className="block truncate rounded-lg px-2 py-1 text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{
                              backgroundColor: item.client.primaryColor || '#1e40af',
                              color: 'white',
                            }}
                          >
                            {item.paaQuestion.substring(0, 25)}...
                          </Link>
                        ))}
                      {getContentForDate(day).length > 3 && (
                        <div className="text-xs text-gray-500 font-medium">
                          +{getContentForDate(day).length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </ContentCard>
    )
  }

  const renderListView = () => {
    return (
      <ContentCard padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  PAA Question
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">
                  Content
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {contentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="text-gray-400">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CalendarIcon className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No content items found</p>
                      <p className="text-xs mt-1 text-gray-400">Try adjusting your filters or create new content</p>
                      <Link href="/admin/content/new">
                        <Button className="mt-4">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Content
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                contentItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`
                      group transition-colors
                      ${item.needsAttention ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'}
                      ${index !== contentItems.length - 1 ? 'border-b border-gray-100' : ''}
                    `}
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDate(item.scheduledDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <Link
                        href={`/admin/clients/${item.client.id}`}
                        className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                      >
                        <div
                          className="h-3 w-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                        />
                        <span className="text-sm text-gray-700 truncate max-w-[120px]">
                          {item.client.businessName}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap hidden md:table-cell">
                      <LocationBadge location={item.serviceLocation} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {item.needsAttention && (
                          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-900 truncate max-w-[300px]">
                          {item.paaQuestion}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap hidden lg:table-cell">
                      <StepProgress item={item} />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap w-[140px]">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/content/${item.id}/review`}>
                          <Button
                            variant={item.status === 'GENERATING' ? 'primary' : 'outline'}
                            size="sm"
                            className={`h-8 px-3 text-xs font-medium ${item.status === 'GENERATING' ? 'animate-pulse' : ''}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            {item.status === 'GENERATING' ? 'View' : 'Review'}
                          </Button>
                        </Link>
                        <div className="w-8">
                          {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'GENERATING' || item.status === 'FAILED') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteContent(item.id, item.paaQuestion)}
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={item.status === 'GENERATING' ? 'Cancel & Delete' : 'Delete'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ContentCard>
    )
  }

  const renderTimelineView = () => {
    const groupedByDate = contentItems.reduce((acc, item) => {
      const date = formatDate(item.scheduledDate)
      if (!acc[date]) acc[date] = []
      acc[date].push(item)
      return acc
    }, {} as Record<string, ContentItem[]>)

    if (Object.keys(groupedByDate).length === 0) {
      return (
        <ContentCard>
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No content items</p>
            <p className="text-sm text-gray-400 mt-1">Create content to see it on the timeline</p>
          </div>
        </ContentCard>
      )
    }

    return (
      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([date, items]) => (
          <ContentCard key={date} padding="none">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900">{date}</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors group"
                >
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/clients/${item.client.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {item.client.businessName}
                      </Link>
                      <span className="text-xs text-gray-500">
                        {formatTime(item.scheduledTime)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 truncate">{item.paaQuestion}</p>
                  </div>
                  <StatusBadge status={item.status} />
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/content/${item.id}/review`}>
                      <Button variant="outline" size="sm" className="h-8">
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View
                      </Button>
                    </Link>
                    {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'GENERATING' || item.status === 'FAILED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteContent(item.id, item.paaQuestion)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={item.status === 'GENERATING' ? 'Cancel & Delete' : 'Delete'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ContentCard>
        ))}
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Content Calendar"
        subtitle="Manage your content pipeline"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        actions={
          <Link href="/admin/content/new">
            <Button className="shadow-lg shadow-blue-500/25">
              <Plus className="h-4 w-4 mr-2" />
              Create Content
            </Button>
          </Link>
        }
      />

      {/* Stats Cards */}
      <StatCardGrid cols={4}>
        <GradientStatCard
          title="Total Content"
          value={stats.total}
          subtitle="All items"
          icon={<FileText />}
          variant="blue"
        />
        <GradientStatCard
          title="Published"
          value={stats.published}
          subtitle="Live content"
          icon={<CheckCircle />}
          variant="green"
        />
        <GradientStatCard
          title="Scheduled"
          value={stats.scheduled}
          subtitle="Upcoming"
          icon={<CalendarIcon />}
          variant="violet"
        />
        {stats.generating > 0 ? (
          <GradientStatCard
            title="Generating"
            value={stats.generating}
            subtitle="In progress"
            icon={<Zap />}
            variant="amber"
          />
        ) : (
          <NeutralStatCard
            title="Failed"
            value={stats.failed}
            subtitle={stats.failed === 0 ? 'All healthy' : 'Need attention'}
            icon={<AlertTriangle />}
            isAlert={stats.failed > 0}
          />
        )}
      </StatCardGrid>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            {/* View Tabs */}
            <div className="flex items-center p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  view === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="h-4 w-4" />
                List
              </button>
              <button
                onClick={() => setView('month')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  view === 'month'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarIcon className="h-4 w-4" />
                Month
              </button>
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  view === 'timeline'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Clock className="h-4 w-4" />
                Timeline
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.businessName}
                </option>
              ))}
            </select>

            {stats.generating > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium">
                <Zap className="h-4 w-4 animate-pulse" />
                {stats.generating} generating
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Views */}
      {view === 'month' && renderMonthView()}
      {view === 'list' && renderListView()}
      {view === 'timeline' && renderTimelineView()}
    </PageContainer>
  )
}

function ContentTypeIcon({
  icon: Icon,
  done,
  label
}: {
  icon: React.ElementType
  done: boolean
  label: string
}) {
  return (
    <div
      className={`p-1 rounded ${done ? 'text-green-600' : 'text-gray-300'}`}
      title={`${label}: ${done ? 'Done' : 'Not done'}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  )
}

function StepProgress({ item }: { item: ContentItem }) {
  if (item.status === 'GENERATING') {
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 text-purple-400">
          <FileText className="h-3.5 w-3.5 animate-pulse" />
          <Images className="h-3.5 w-3.5 animate-pulse delay-75" />
          <Share2 className="h-3.5 w-3.5 animate-pulse delay-100" />
        </div>
        <span className="text-xs text-purple-600 font-medium ml-1">Generating...</span>
      </div>
    )
  }

  if (!item.blogGenerated && item.status === 'DRAFT') {
    return (
      <span className="text-xs text-gray-400">Not started</span>
    )
  }

  const blogPublished = !!item.blogPost?.wordpressPostId
  const contentTypes = [
    { icon: FileText, done: blogPublished, label: 'Blog Published' },
    { icon: Images, done: item.imagesGenerated && blogPublished, label: 'Images (in blog)' },
    { icon: Share2, done: !!item.socialPosts?.some(p => p.publishedUrl), label: 'Social Posted' },
    { icon: Mic, done: item.podcastGenerated, label: 'Podcast Created' },
    { icon: Video, done: item.shortVideoGenerated, label: 'Short Video Created' },
    { icon: Film, done: !!item.longformVideoUrl, label: 'Long Video' },
    { icon: Code, done: item.schemaGenerated && blogPublished, label: 'Schema Live' },
    { icon: Link2, done: item.podcastAddedToPost || item.shortVideoAddedToPost || item.longVideoAddedToPost, label: 'Media Embedded' },
  ]

  return (
    <div className="flex items-center gap-0.5">
      {contentTypes.map((type, i) => (
        <ContentTypeIcon key={i} icon={type.icon} done={type.done} label={type.label} />
      ))}
    </div>
  )
}

function LocationBadge({ location }: { location: ContentItem['serviceLocation'] }) {
  if (!location) return <span className="text-sm text-gray-300">—</span>

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-medium text-gray-600">
      {location.neighborhood ? `${location.neighborhood}, ` : ''}
      {location.city}
    </span>
  )
}
