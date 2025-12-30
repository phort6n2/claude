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
} from 'lucide-react'

type ViewMode = 'month' | 'list' | 'timeline'

interface ContentItem {
  id: string
  paaQuestion: string
  scheduledDate: string
  scheduledTime: string
  status: string
  pipelineStep: string | null
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

export default function ContentCalendarPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const fetchContent = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedClient !== 'all') params.append('clientId', selectedClient)
      if (selectedStatus !== 'all') params.append('status', selectedStatus)

      const response = await fetch(`/api/content?${params}`)
      const data = await response.json()
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Scheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  PAA Question
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Progress
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No content items found
                  </td>
                </tr>
              ) : (
                contentItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">
                        {formatDate(item.scheduledDate)}
                      </div>
                      <div className="text-gray-500">{formatTime(item.scheduledTime)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.client.primaryColor || '#1e40af' }}
                        />
                        <span className="text-sm">{item.client.businessName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-md truncate">
                        {item.paaQuestion}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PipelineProgress step={item.pipelineStep} status={item.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link href={`/admin/content/${item.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
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

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm"
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="GENERATING">Generating</option>
            <option value="PUBLISHED">Published</option>
            <option value="FAILED">Failed</option>
          </select>

          <Button variant="outline" size="sm" onClick={fetchContent}>
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
