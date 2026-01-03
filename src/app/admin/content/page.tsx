'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'
import {
  Plus,
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
  Zap,
} from 'lucide-react'
import CreateContentModal from '@/components/admin/CreateContentModal'

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
  const [showCreateModal, setShowCreateModal] = useState(false)

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

  const fetchContent = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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

  // Auto-refresh when there are GENERATING items
  useEffect(() => {
    const hasGenerating = contentItems.some(item => item.status === 'GENERATING')
    if (!hasGenerating) return

    const interval = setInterval(() => {
      fetchContent()
      fetchAllContent()
    }, 5000) // Refresh every 5 seconds

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
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Location
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  PAA Question
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                  Progress
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No content items found
                  </td>
                </tr>
              ) : (
                contentItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.needsAttention ? 'bg-yellow-50' : ''}`}>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="font-medium text-gray-900 text-xs">
                        {formatDate(item.scheduledDate)}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <div
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                        />
                        <span className="text-xs truncate max-w-[100px]">{item.client.businessName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap hidden md:table-cell">
                      <LocationBadge location={item.serviceLocation} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        {item.needsAttention && (
                          <AlertCircle className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                        )}
                        <div className="text-xs text-gray-900 truncate max-w-[250px]">
                          {item.paaQuestion}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap hidden lg:table-cell">
                      <StepProgress item={item} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/content/${item.id}/review`}>
                          <Button
                            variant={item.status === 'GENERATING' ? 'primary' : 'outline'}
                            size="sm"
                            className={`h-6 px-2 text-xs ${item.status === 'GENERATING' ? 'animate-pulse' : ''}`}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            {item.status === 'GENERATING' ? 'View' : 'Review'}
                          </Button>
                        </Link>
                        {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'GENERATING' || item.status === 'FAILED') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteContent(item.id, item.paaQuestion)}
                            className="h-6 px-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title={item.status === 'GENERATING' ? 'Cancel & Delete' : 'Delete'}
                          >
                            <Trash2 className="h-3 w-3" />
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
      </Card>
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
        {/* Status Filter Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <StatusFilterBadge
            label="All"
            count={statusCounts.all}
            active={selectedStatus === 'all'}
            onClick={() => setSelectedStatus('all')}
          />
          <StatusFilterBadge
            label="Needs Attention"
            count={statusCounts.needsAttention}
            active={selectedStatus === 'needsAttention'}
            onClick={() => setSelectedStatus('needsAttention')}
            variant="warning"
          />
          <StatusFilterBadge
            label="Review"
            count={statusCounts.review}
            active={selectedStatus === 'REVIEW'}
            onClick={() => setSelectedStatus('REVIEW')}
            variant="info"
          />
          <StatusFilterBadge
            label="Generating"
            count={statusCounts.generating}
            active={selectedStatus === 'GENERATING'}
            onClick={() => setSelectedStatus('GENERATING')}
            variant="processing"
          />
          <StatusFilterBadge
            label="Scheduled"
            count={statusCounts.scheduled}
            active={selectedStatus === 'SCHEDULED'}
            onClick={() => setSelectedStatus('SCHEDULED')}
          />
          <StatusFilterBadge
            label="Approved"
            count={statusCounts.approved}
            active={selectedStatus === 'APPROVED'}
            onClick={() => setSelectedStatus('APPROVED')}
            variant="success"
          />
          <StatusFilterBadge
            label="Published"
            count={statusCounts.published}
            active={selectedStatus === 'PUBLISHED'}
            onClick={() => setSelectedStatus('PUBLISHED')}
            variant="success"
          />
          <StatusFilterBadge
            label="Failed"
            count={statusCounts.failed}
            active={selectedStatus === 'FAILED'}
            onClick={() => setSelectedStatus('FAILED')}
            variant="danger"
          />
          <StatusFilterBadge
            label="Draft"
            count={statusCounts.draft}
            active={selectedStatus === 'DRAFT'}
            onClick={() => setSelectedStatus('DRAFT')}
          />
        </div>

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

          <Button onClick={() => setShowCreateModal(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Create Now
          </Button>

          <Link href="/admin/content/new">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Schedule
            </Button>
          </Link>
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

      {/* Create Content Modal */}
      <CreateContentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchContent()
          fetchAllContent()
        }}
      />
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

function StepProgress({ item }: { item: ContentItem }) {
  const { completed, total, nextStep, isComplete } = getStepCompletion(item)

  // Show "Generating..." for items still generating
  if (item.status === 'GENERATING') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-gray-200 rounded-full h-2">
          <div
            className="bg-purple-500 h-2 rounded-full animate-pulse"
            style={{ width: '20%' }}
          />
        </div>
        <span className="text-xs text-purple-600 font-medium">Generating...</span>
      </div>
    )
  }

  // Show "Not started" for drafts with no content
  if (!item.blogGenerated && item.status === 'DRAFT') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-gray-200 rounded-full h-2" />
        <span className="text-xs text-gray-400">Not started</span>
      </div>
    )
  }

  // Show progress bar and next step
  const progressPercent = (completed / total) * 100

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-200 rounded-full h-2" title={`${completed}/${total} steps complete`}>
        <div
          className={`h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {isComplete ? (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Complete
        </span>
      ) : (
        <span className="text-xs text-gray-600">
          {completed}/{total} · <span className="text-blue-600">{nextStep}</span>
        </span>
      )}
    </div>
  )
}

function StatusFilterBadge({
  label,
  count,
  active,
  onClick,
  variant = 'default',
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  variant?: 'default' | 'warning' | 'info' | 'processing' | 'success' | 'danger'
}) {
  const variantStyles = {
    default: active ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    warning: active ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
    info: active ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    processing: active ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-800 hover:bg-purple-200',
    success: active ? 'bg-green-500 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200',
    danger: active ? 'bg-red-500 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200',
  }

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${variantStyles[variant]}`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
          active ? 'bg-white/20' : 'bg-black/10'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}


function LocationBadge({ location }: { location: ContentItem['serviceLocation'] }) {
  if (!location) return <span className="text-xs text-gray-400">-</span>

  return (
    <span className="text-xs text-gray-600">
      {location.neighborhood ? `${location.neighborhood}, ` : ''}
      {location.city}
    </span>
  )
}
