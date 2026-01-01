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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push(`/admin/clients/${id}`)}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generate Content Calendar</h1>
          <p className="text-sm text-gray-500">
            Create years of content from PAA questions × service locations
          </p>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <Check size={18} />
          {success}
        </div>
      )}

      {/* Current Status */}
      {status && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Current Status</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {status.totalContentItems}
              </div>
              <div className="text-sm text-gray-500">Content Items</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {status.locationsCount}
              </div>
              <div className="text-sm text-gray-500">Locations</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {status.paaQuestionsCount}
              </div>
              <div className="text-sm text-gray-500">PAA Questions</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {status.potentialItems}
              </div>
              <div className="text-sm text-gray-500">Potential Items</div>
            </div>
          </div>

          {status.calendarGenerated && (
            <div className="text-sm text-gray-600">
              <Calendar className="inline mr-2" size={16} />
              Calendar generated on{' '}
              {new Date(status.calendarGeneratedAt!).toLocaleDateString()}, extends to{' '}
              {new Date(status.calendarEndDate!).toLocaleDateString()}
            </div>
          )}

          {Object.keys(status.statusDistribution).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Status Distribution</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(status.statusDistribution).map(([status, count]) => (
                  <span
                    key={status}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                  >
                    {status}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generation Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Generation Settings</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Years of Content
            </label>
            <select
              value={yearsAhead}
              onChange={(e) => setYearsAhead(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {previewing ? 'Loading...' : 'Preview Plan'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Preview Results</h2>
            <span className="text-sm text-gray-500">
              {preview.skippedDuplicates} duplicates skipped
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">
                {preview.totalItems}
              </div>
              <div className="text-sm text-blue-600">Items to Create</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-lg font-medium text-gray-900">
                {preview.startDate?.split('T')[0]}
              </div>
              <div className="text-sm text-gray-500">Start Date</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-lg font-medium text-gray-900">
                {preview.endDate?.split('T')[0]}
              </div>
              <div className="text-sm text-gray-500">End Date</div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">By Location</h3>
            <div className="space-y-2">
              {Object.entries(preview.byLocation).map(([location, count]) => (
                <div key={location} className="flex items-center gap-2">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="flex-1 text-sm text-gray-600">{location}</span>
                  <span className="text-sm font-medium text-gray-900">{count} items</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Sample Content</h3>
            <div className="space-y-2">
              {preview.sampleItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded text-sm"
                >
                  <FileText size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="flex-1 text-gray-700">{item.question}</span>
                  <span className="text-gray-500">{item.location}</span>
                  <span className="text-gray-400">{item.date}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || preview.totalItems === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
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
  )
}
