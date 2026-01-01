'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Calendar, Trash2, Play, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react'

interface ScheduleActionsProps {
  clientId: string
  clientName: string
  hasSchedule: boolean
  scheduledCount: number
}

export default function ScheduleActions({
  clientId,
  clientName,
  hasSchedule,
  scheduledCount
}: ScheduleActionsProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/generate-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearsAhead: 2 }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Generated ${data.totalGenerated} content items`
        })
        router.refresh()
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to generate schedule'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Network error. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = async () => {
    if (!confirm(`Clear all scheduled content for ${clientName}? This cannot be undone.`)) {
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/clear-schedule`, {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Cleared ${data.deleted} scheduled items`
        })
        router.refresh()
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to clear schedule'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Network error. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    setResult(null)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="px-1.5 py-1 h-7"
        onClick={() => setIsOpen(true)}
        title={hasSchedule ? `${scheduledCount} scheduled` : 'Generate schedule'}
      >
        <Calendar className={`h-4 w-4 ${hasSchedule ? 'text-green-600' : 'text-gray-400'}`} />
        {hasSchedule && scheduledCount > 0 && (
          <span className="ml-1 text-xs text-green-600 font-medium">{scheduledCount}</span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Content Schedule</h3>
              <p className="text-sm text-gray-500 mt-1">{clientName}</p>
            </div>

            {/* Result message */}
            {result && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {result.success ? (
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                )}
                {result.message}
              </div>
            )}

            {/* Status info */}
            {hasSchedule && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Scheduled items:</span>
                  <span className="text-lg font-semibold text-green-600">{scheduledCount}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {!hasSchedule ? (
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                  Generate Schedule
                </button>
              ) : (
                <>
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                    Add More Content
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                    Clear All Scheduled
                  </button>
                </>
              )}
            </div>

            {/* Help text */}
            <p className="mt-4 text-xs text-gray-500 text-center">
              Content publishes every Tuesday and Thursday
            </p>
          </div>
        </div>
      )}
    </>
  )
}
