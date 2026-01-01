'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Calendar, Trash2, Play, Loader2, AlertCircle, CheckCircle } from 'lucide-react'

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

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="px-1.5 py-1 h-7"
        onClick={() => setIsOpen(!isOpen)}
        title={hasSchedule ? `${scheduledCount} scheduled` : 'Generate schedule'}
      >
        <Calendar className={`h-4 w-4 ${hasSchedule ? 'text-green-600' : 'text-gray-400'}`} />
        {hasSchedule && scheduledCount > 0 && (
          <span className="ml-1 text-xs text-green-600 font-medium">{scheduledCount}</span>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border p-3 w-64">
            <div className="text-sm font-medium text-gray-900 mb-3">
              Content Schedule
            </div>

            {result && (
              <div className={`mb-3 p-2 rounded text-sm flex items-center gap-2 ${
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

            <div className="space-y-2">
              {!hasSchedule ? (
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-gray-100 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 text-green-600" />
                  )}
                  Generate Schedule
                </button>
              ) : (
                <>
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {scheduledCount} items scheduled
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-gray-100 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 text-blue-600" />
                    )}
                    Add More Content
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Clear All Scheduled
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
