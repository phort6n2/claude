'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
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
  CheckCircle,
  Eye,
  Trash2,
  FileText,
  ImageIcon,
  Share2,
  Mic,
  Video,
  Film,
  Code,
  Link2,
} from 'lucide-react'

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

interface StatusCounts {
  all: number
  draft: number
  scheduled: number
  generating: number
  review: number
  approved: number
  published: number
  failed: number
  needsAttention: number
}

export default function ContentCalendarPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    all: 0,
    draft: 0,
    scheduled: 0,
    generating: 0,
    review: 0,
    approved: 0,
    published: 0,
    failed: 0,
    needsAttention: 0,
  })

  // Fetch all content for status counts
  const fetchAllContent = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (selectedClient !== 'all') params.append('clientId', selectedClient)

      const response = await fetch(`/api/content?${params}`)
      const data = await response.json()

      // Calculate status counts
      const counts: StatusCounts = {
        all: data.length,
        draft: data.filter((i: ContentItem) => i.status === 'DRAFT').length,
        scheduled: data.filter((i: ContentItem) => i.status === 'SCHEDULED').length,
        generating: data.filter((i: ContentItem) => i.status === 'GENERATING').length,
        review: data.filter((i: ContentItem) => i.status === 'REVIEW').length,
        approved: data.filter((i: ContentItem) => i.status === 'APPROVED').length,
        published: data.filter((i: ContentItem) => i.status === 'PUBLISHED').length,
        failed: data.filter((i: ContentItem) => i.status === 'FAILED').length,
        needsAttention: data.filter((i: ContentItem) => i.needsAttention).length,
      }
      setStatusCounts(counts)
    } catch (error) {
      console.error('Failed to fetch all content:', error)
    }
  }, [selectedClient])

  const fetchContent = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedClient !== 'all') params.append('clientId', selectedClient)
      if (selectedStatus !== 'all' && selectedStatus !== 'needsAttention') {
        params.append('status', selectedStatus)
      }

      const response = await fetch(`/api/content?${params}`)
      let data = await response.json()

      // Filter for needsAttention locally
      if (selectedStatus === 'needsAttention') {
        data = data.filter((i: ContentItem) => i.needsAttention)
      }

      setContentItems(data)
    } catch (error) {
      console.error('Failed to fetch content:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [selectedClient, selectedStatus])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  useEffect(() => {
    fetchAllContent()
  }, [fetchAllContent])

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
      fetchAllContent()
    }, 10000) // Refresh every 10 seconds

    return () => clearInterval(interval)
  }, [contentItems, fetchContent, fetchAllContent])

  const handleDeleteContent = async (id: string, question: string) => {
    if (!confirm(`Delete this content item?\n\n"${question.substring(0, 60)}${question.length > 60 ? '...' : ''}"\n\nThis cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/content/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Remove from local state
        setContentItems(prev => prev.filter(item => item.id !== id))
        // Refresh counts
        fetchAllContent()
      }
    } catch (error) {
      console.error('Failed to delete content:', error)
    }
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = []

    // Add padding for first week
    const startDay = firstDay.getDay()
    for (let i = 0; i < startDay; i++) {
      days.push(null)
    }

    // Add all days in month
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

  const renderMonthView = () => {
    const days = getDaysInMonth(currentMonth)
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle>
              {currentMonth.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {weekDays.map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500"
              >
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div
                key={index}
                className={`min-h-24 bg-white p-2 ${
                  day ? 'hover:bg-gray-50' : 'bg-gray-50'
                }`}
              >
                {day && (
                  <>
                    <div className="text-sm text-gray-500">{day.getDate()}</div>
                    <div className="mt-1 space-y-1">
                      {getContentForDate(day)
                        .slice(0, 3)
                        .map((item) => (
                          <Link
                            key={item.id}
                            href={`/admin/content/${item.id}`}
                            className="block truncate rounded px-1 py-0.5 text-xs"
                            style={{
                              backgroundColor: item.client.primaryColor || '#1e40af',
                              color: 'white',
                            }}
                          >
                            {item.paaQuestion.substring(0, 30)}...
                          </Link>
                        ))}
                      {getContentForDate(day).length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{getContentForDate(day).length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderListView = () => {
    return (
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  PAA Question
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">
                  Content
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {contentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="text-gray-400">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium">No content items found</p>
                      <p className="text-xs mt-1">Try adjusting your filters or create new content</p>
                    </div>
                  </td>
                </tr>
              ) : (
                contentItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`
                      group transition-colors
                      ${item.needsAttention ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50/50'}
                      ${index !== contentItems.length - 1 ? 'border-b border-gray-100' : ''}
                    `}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDate(item.scheduledDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                        />
                        <span className="text-sm text-gray-700 truncate max-w-[120px]">
                          {item.client.businessName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                      <LocationBadge location={item.serviceLocation} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.needsAttention && (
                          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-900 truncate max-w-[300px]">
                          {item.paaQuestion}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                      <StepProgress item={item} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/content/${item.id}/review`}>
                          <Button
                            variant={item.status === 'GENERATING' ? 'primary' : 'outline'}
                            size="sm"
                            className={`h-7 px-3 text-xs font-medium ${item.status === 'GENERATING' ? 'animate-pulse' : ''}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            {item.status === 'GENERATING' ? 'View' : 'Review'}
                          </Button>
                        </Link>
                        {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'GENERATING' || item.status === 'FAILED') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteContent(item.id, item.paaQuestion)}
                            className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title={item.status === 'GENERATING' ? 'Cancel & Delete' : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderTimelineView = () => {
    const groupedByDate = contentItems.reduce((acc, item) => {
      const date = formatDate(item.scheduledDate)
      if (!acc[date]) acc[date] = []
      acc[date].push(item)
      return acc
    }, {} as Record<string, ContentItem[]>)

    return (
      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([date, items]) => (
          <Card key={date}>
            <CardHeader>
              <CardTitle className="text-lg">{date}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {item.client.businessName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(item.scheduledTime)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{item.paaQuestion}</p>
                    </div>
                    <StatusBadge status={item.status} />
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/content/${item.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                      {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'GENERATING' || item.status === 'FAILED') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteContent(item.id, item.paaQuestion)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          title={item.status === 'GENERATING' ? 'Cancel & Delete' : 'Delete'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Content Calendar" subtitle="Manage your content pipeline" />
      <div className="flex-1 p-6 overflow-auto">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex gap-2">
            <Button
              variant={view === 'month' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView('month')}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              Month
            </Button>
            <Button
              variant={view === 'list' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView('list')}
            >
              <List className="h-4 w-4 mr-2" />
              List
            </Button>
            <Button
              variant={view === 'timeline' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView('timeline')}
            >
              <Clock className="h-4 w-4 mr-2" />
              Timeline
            </Button>
          </div>

          <div className="flex-1" />

          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm"
          >
            <option value="all">All Clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.businessName}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={() => { fetchContent(); fetchAllContent(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : (
          <>
            {view === 'month' && renderMonthView()}
            {view === 'list' && renderListView()}
            {view === 'timeline' && renderTimelineView()}
          </>
        )}
      </div>
    </div>
  )
}

// Calculate step completion for an item
function getStepCompletion(item: ContentItem): { completed: number; total: number; nextStep: string | null; isComplete: boolean } {
  const steps = [
    { name: 'Blog', done: item.blogGenerated && item.blogPost?.wordpressPostId },
    { name: 'Images', done: item.imagesGenerated && item.imagesApproved === 'APPROVED' },
    { name: 'Social', done: item.socialGenerated && item.socialPosts?.some(p => p.publishedUrl) },
    { name: 'Podcast', done: item.podcastGenerated && item.podcast?.podbeanUrl },
    { name: 'Short Video', done: item.shortVideoGenerated && item.shortFormVideos?.some(v => v.publishedUrls && Object.keys(v.publishedUrls).length > 0) },
    { name: 'Long Video', done: !!item.longformVideoUrl },
    { name: 'Schema', done: item.schemaGenerated && item.blogPost?.schemaJson },
    { name: 'Embed', done: item.podcastAddedToPost || item.shortVideoAddedToPost || item.longVideoAddedToPost },
  ]

  const completed = steps.filter(s => s.done).length
  const nextStep = steps.find(s => !s.done)?.name || null

  return {
    completed,
    total: 8,
    nextStep,
    isComplete: completed === 8,
  }
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
  // Show "Generating..." for items still generating
  if (item.status === 'GENERATING') {
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 text-purple-400">
          <FileText className="h-3.5 w-3.5 animate-pulse" />
          <ImageIcon className="h-3.5 w-3.5 animate-pulse delay-75" />
          <Share2 className="h-3.5 w-3.5 animate-pulse delay-100" />
        </div>
        <span className="text-xs text-purple-600 font-medium ml-1">Generating...</span>
      </div>
    )
  }

  // Show "Not started" for drafts with no content
  if (!item.blogGenerated && item.status === 'DRAFT') {
    return (
      <span className="text-xs text-gray-400">Not started</span>
    )
  }

  // Content type status
  const contentTypes = [
    { icon: FileText, done: item.blogGenerated && !!item.blogPost?.wordpressPostId, label: 'Blog' },
    { icon: ImageIcon, done: item.imagesGenerated && item.imagesApproved === 'APPROVED', label: 'Images' },
    { icon: Share2, done: item.socialGenerated && !!item.socialPosts?.some(p => p.publishedUrl), label: 'Social' },
    { icon: Mic, done: item.podcastGenerated && !!item.podcast?.podbeanUrl, label: 'Podcast' },
    { icon: Video, done: item.shortVideoGenerated && !!item.shortFormVideos?.some(v => v.publishedUrls && Object.keys(v.publishedUrls).length > 0), label: 'Short Video' },
    { icon: Film, done: !!item.longformVideoUrl, label: 'Long Video' },
    { icon: Code, done: item.schemaGenerated && !!item.blogPost?.schemaJson, label: 'Schema' },
    { icon: Link2, done: item.podcastAddedToPost || item.shortVideoAddedToPost || item.longVideoAddedToPost, label: 'Embedded' },
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-sm text-gray-600">
      {location.neighborhood ? `${location.neighborhood}, ` : ''}
      {location.city}
    </span>
  )
}
