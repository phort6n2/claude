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
  FileText,
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
  client: {
    id: string
    businessName: string
    primaryColor: string | null
  }
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
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Scheduled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  PAA Question
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Approval
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Progress
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contentItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No content items found
                  </td>
                </tr>
              ) : (
                contentItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.needsAttention ? 'bg-yellow-50' : ''}`}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">
                        {formatDate(item.scheduledDate)}
                      </div>
                      <div className="text-gray-500">{formatTime(item.scheduledTime)}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                        />
                        <span className="text-sm">{item.client.businessName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {item.needsAttention && (
                          <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                        )}
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {item.paaQuestion}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <ApprovalIndicators item={item} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <PipelineProgress step={item.pipelineStep} status={item.status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(item.status === 'REVIEW' || item.status === 'GENERATING' || item.blogGenerated) && (
                          <Link href={`/admin/content/${item.id}/review`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                          </Link>
                        )}
                        <Link href={`/admin/content/${item.id}`}>
                          <Button variant="ghost" size="sm">
                            <FileText className="h-3 w-3" />
                          </Button>
                        </Link>
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
                    <Link href={`/admin/content/${item.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
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

          <Link href="/admin/content/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Content
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
    </div>
  )
}

function PipelineProgress({
  step,
  status,
}: {
  step: string | null
  status: string
}) {
  const steps = ['blog', 'images', 'wordpress', 'podcast', 'videos', 'social']
  const currentIndex = step ? steps.indexOf(step.toLowerCase()) : -1

  if (status === 'PUBLISHED') {
    return (
      <div className="flex gap-1">
        {steps.map((s) => (
          <div key={s} className="h-2 w-4 rounded-full bg-green-500" title={s} />
        ))}
      </div>
    )
  }

  if (status === 'FAILED') {
    return (
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-2 w-4 rounded-full ${
              i < currentIndex
                ? 'bg-green-500'
                : i === currentIndex
                ? 'bg-red-500'
                : 'bg-gray-200'
            }`}
            title={s}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-2 w-4 rounded-full ${
            i < currentIndex
              ? 'bg-green-500'
              : i === currentIndex
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-gray-200'
          }`}
          title={s}
        />
      ))}
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

function ApprovalIndicators({ item }: { item: ContentItem }) {
  const getIndicatorClass = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-500'
      case 'NEEDS_REVISION':
        return 'bg-red-500'
      default:
        return 'bg-gray-300'
    }
  }

  const indicators = [
    { label: 'B', status: item.blogApproved, generated: item.blogGenerated, title: 'Blog' },
    { label: 'I', status: item.imagesApproved, generated: item.imagesGenerated, title: 'Images' },
    { label: 'S', status: item.socialApproved, generated: item.socialGenerated, title: 'Social' },
  ]

  return (
    <div className="flex gap-1">
      {indicators.map((ind) => (
        <div
          key={ind.label}
          className={`h-5 w-5 rounded text-xs font-medium flex items-center justify-center ${
            !ind.generated ? 'bg-gray-100 text-gray-400' : getIndicatorClass(ind.status)
          } ${ind.status === 'APPROVED' ? 'text-white' : ind.status === 'NEEDS_REVISION' ? 'text-white' : 'text-gray-600'}`}
          title={`${ind.title}: ${ind.generated ? ind.status : 'Not Generated'}`}
        >
          {ind.generated && ind.status === 'APPROVED' ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            ind.label
          )}
        </div>
      ))}
    </div>
  )
}
