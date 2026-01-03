'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react'

interface ContentItem {
  id: string
  client: {
    id: string
    name: string
    color: string | null
  }
  question: string
  location: string | null
  scheduledTime: string
  status: string
  publishedAt: string | null
  steps: {
    blog: { generated: boolean; published: boolean; url: string | null }
    podcast: { generated: boolean; published: boolean; url: string | null }
    images: { generated: boolean; approved: boolean }
    social: { generated: boolean; platforms: Array<{ platform: string; published: boolean; url: string | null }> }
    shortVideo: { generated: boolean; addedToPost: boolean }
    longVideo: { uploaded: boolean; url: string | null }
    schema: { generated: boolean }
    embed: { complete: boolean }
  }
}

interface DailyReport {
  date: string
  items: ContentItem[]
  summary: {
    total: number
    byStatus: Record<string, number>
    fullyComplete: number
  }
}

export default function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReport()
  }, [selectedDate])

  async function fetchReport() {
    setLoading(true)
    try {
      const dateStr = selectedDate.toISOString().split('T')[0]
      const response = await fetch(`/api/reports/daily-content?date=${dateStr}`)
      const data = await response.json()
      setReport(data)
    } catch (error) {
      console.error('Failed to fetch report:', error)
    } finally {
      setLoading(false)
    }
  }

  function goToToday() {
    setSelectedDate(new Date())
  }

  function goToPreviousDay() {
    const prev = new Date(selectedDate)
    prev.setDate(prev.getDate() - 1)
    setSelectedDate(prev)
  }

  function goToNextDay() {
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + 1)
    setSelectedDate(next)
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'PUBLISHED':
        return 'bg-green-100 text-green-800'
      case 'APPROVED':
        return 'bg-blue-100 text-blue-800'
      case 'REVIEW':
        return 'bg-yellow-100 text-yellow-800'
      case 'GENERATING':
        return 'bg-purple-100 text-purple-800'
      case 'FAILED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Daily Content Report" subtitle="View content posted on any day" />
      <div className="flex-1 p-6 overflow-auto">
        {/* Date Navigation */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={goToPreviousDay}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <span className="text-lg font-semibold">{formatDate(selectedDate)}</span>
                </div>
                <Button variant="outline" size="sm" onClick={goToNextDay}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="px-3 py-1.5 border rounded-md text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : !report ? (
          <div className="text-center text-gray-500 py-12">Failed to load report</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="py-4">
                  <div className="text-sm text-gray-500">Total Items</div>
                  <div className="text-2xl font-bold">{report.summary.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-sm text-gray-500">Published</div>
                  <div className="text-2xl font-bold text-green-600">
                    {report.summary.byStatus.published || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-sm text-gray-500">In Review</div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {report.summary.byStatus.review || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-sm text-gray-500">Fully Complete</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {report.summary.fullyComplete}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Content Items */}
            {report.items.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  No content scheduled for this day
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {report.items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.client.color || '#1e40af' }}
                          />
                          <div>
                            <div className="font-semibold">{item.client.name}</div>
                            {item.location && (
                              <div className="text-sm text-gray-500">{item.location}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                            {item.status}
                          </span>
                          <Link href={`/admin/content/${item.id}/review`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>

                      <div className="text-sm text-gray-900 mb-4">{item.question}</div>

                      {/* Step Progress */}
                      <div className="flex flex-wrap gap-2">
                        <StepBadge
                          label="Blog"
                          done={item.steps.blog.published}
                          inProgress={item.steps.blog.generated && !item.steps.blog.published}
                          url={item.steps.blog.url}
                        />
                        <StepBadge
                          label="Podcast"
                          done={item.steps.podcast.published}
                          inProgress={item.steps.podcast.generated && !item.steps.podcast.published}
                          url={item.steps.podcast.url}
                        />
                        <StepBadge
                          label="Images"
                          done={item.steps.images.approved}
                          inProgress={item.steps.images.generated && !item.steps.images.approved}
                        />
                        <StepBadge
                          label="Social"
                          done={item.steps.social.platforms.some((p) => p.published)}
                          inProgress={item.steps.social.generated && !item.steps.social.platforms.some((p) => p.published)}
                        />
                        <StepBadge
                          label="Short Video"
                          done={item.steps.shortVideo.addedToPost}
                          inProgress={item.steps.shortVideo.generated && !item.steps.shortVideo.addedToPost}
                        />
                        <StepBadge
                          label="Long Video"
                          done={item.steps.longVideo.uploaded}
                          url={item.steps.longVideo.url}
                        />
                        <StepBadge label="Schema" done={item.steps.schema.generated} />
                        <StepBadge label="Embed" done={item.steps.embed.complete} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StepBadge({
  label,
  done,
  inProgress = false,
  url,
}: {
  label: string
  done: boolean
  inProgress?: boolean
  url?: string | null
}) {
  const baseClasses = 'px-2 py-1 rounded text-xs font-medium flex items-center gap-1'

  if (done) {
    return (
      <span className={`${baseClasses} bg-green-100 text-green-800`}>
        <CheckCircle className="h-3 w-3" />
        {label}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="ml-1">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </span>
    )
  }

  if (inProgress) {
    return (
      <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
        <Clock className="h-3 w-3" />
        {label}
      </span>
    )
  }

  return (
    <span className={`${baseClasses} bg-gray-100 text-gray-500`}>
      <AlertCircle className="h-3 w-3" />
      {label}
    </span>
  )
}
