'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  MapPin,
  FileText,
  Sparkles,
  AlertCircle,
  Check,
  ChevronLeft,
  Loader2,
  Clock,
  BarChart3,
} from 'lucide-react'

interface CalendarStatus {
  calendarGenerated: boolean
  calendarGeneratedAt: string | null
  calendarEndDate: string | null
  totalContentItems: number
  locationsCount: number
  paaQuestionsCount: number
  potentialItems: number
  statusDistribution: Record<string, number>
}

interface PreviewData {
  preview: boolean
  totalItems: number
  skippedDuplicates: number
  startDate: string | null
  endDate: string | null
  byLocation: Record<string, number>
  sampleItems: Array<{
    question: string
    location: string
    date: string
  }>
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ClientCalendarPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()

  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Settings
  const [yearsAhead, setYearsAhead] = useState(2)

  useEffect(() => {
    fetchStatus()
  }, [id])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/clients/${id}/generate-calendar`)
      if (!response.ok) throw new Error('Failed to fetch status')
      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setError(null)
    try {
      const response = await fetch(`/api/clients/${id}/generate-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearsAhead,
          preview: true,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPreviewing(false)
    }
  }

  const handleGenerate = async () => {
    if (!confirm('This will generate all content items. Continue?')) return

    setGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/clients/${id}/generate-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearsAhead,
          preview: false,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      setSuccess(`Successfully created ${data.totalGenerated} content items!`)
      setPreview(null)
      fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push(`/admin/clients/${id}`)}
            className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white rounded-xl border border-gray-200 shadow-sm transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Generate Content Calendar</h1>
              <p className="text-sm text-gray-500">
                Create years of content from PAA questions × service locations
              </p>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle size={18} />
            </div>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-green-700">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check size={18} />
            </div>
            <span className="font-medium">{success}</span>
          </div>
        )}

        {/* Current Status */}
        {status && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-gray-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-gray-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Current Status</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100">
                <div className="text-3xl font-bold text-gray-900">
                  {status.totalContentItems}
                </div>
                <div className="text-sm text-gray-500 mt-1">Content Items</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100">
                <div className="text-3xl font-bold text-blue-600">
                  {status.locationsCount}
                </div>
                <div className="text-sm text-blue-600 mt-1">Locations</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-violet-50 to-white rounded-xl border border-violet-100">
                <div className="text-3xl font-bold text-violet-600">
                  {status.paaQuestionsCount}
                </div>
                <div className="text-sm text-violet-600 mt-1">PAA Questions</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-green-50 to-white rounded-xl border border-green-100">
                <div className="text-3xl font-bold text-green-600">
                  {status.potentialItems}
                </div>
                <div className="text-sm text-green-600 mt-1">Potential Items</div>
              </div>
            </div>

            {status.calendarGenerated && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                <Clock className="h-4 w-4 text-gray-400" />
                Calendar generated on{' '}
                <span className="font-medium">{new Date(status.calendarGeneratedAt!).toLocaleDateString()}</span>, extends to{' '}
                <span className="font-medium">{new Date(status.calendarEndDate!).toLocaleDateString()}</span>
              </div>
            )}

            {Object.keys(status.statusDistribution).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Status Distribution</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(status.statusDistribution).map(([statusKey, count]) => (
                    <span
                      key={statusKey}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg"
                    >
                      {statusKey}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generation Settings */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Generation Settings</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Years of Content
              </label>
              <select
                value={yearsAhead}
                onChange={(e) => setYearsAhead(parseInt(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value={1}>1 year</option>
                <option value={2}>2 years</option>
                <option value={3}>3 years</option>
                <option value={5}>5 years</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 font-medium transition-all"
              >
                {previewing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    Loading...
                  </span>
                ) : (
                  'Preview Plan'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Preview Results */}
        {preview && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Preview Results</h2>
              </div>
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                {preview.skippedDuplicates} duplicates skipped
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200">
                <div className="text-4xl font-bold text-blue-600">
                  {preview.totalItems}
                </div>
                <div className="text-sm font-medium text-blue-600 mt-1">Items to Create</div>
              </div>
              <div className="text-center p-5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-lg font-semibold text-gray-900">
                  {preview.startDate?.split('T')[0]}
                </div>
                <div className="text-sm text-gray-500 mt-1">Start Date</div>
              </div>
              <div className="text-center p-5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-lg font-semibold text-gray-900">
                  {preview.endDate?.split('T')[0]}
                </div>
                <div className="text-sm text-gray-500 mt-1">End Date</div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">By Location</h3>
              <div className="space-y-2">
                {Object.entries(preview.byLocation).map(([location, count]) => (
                  <div key={location} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 font-medium">{location}</span>
                    <span className="text-sm font-semibold text-gray-900 bg-white px-2.5 py-1 rounded-lg border border-gray-200">{count} items</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Sample Content</h3>
              <div className="space-y-2">
                {preview.sampleItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm"
                  >
                    <FileText size={16} className="text-blue-500 flex-shrink-0" />
                    <span className="flex-1 text-gray-700 font-medium truncate">{item.question}</span>
                    <span className="text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200">{item.location}</span>
                    <span className="text-gray-400 text-xs">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || preview.totalItems === 0}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold shadow-sm transition-all"
            >
              {generating ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate {preview.totalItems} Content Items
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
