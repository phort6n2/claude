'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Loader2, AlertCircle, CheckCircle, X, Power, Clock } from 'lucide-react'

interface ScheduleActionsProps {
  clientId: string
  clientName: string
  hasSchedule: boolean
  scheduledCount: number
}

interface AutoScheduleStatus {
  automation: {
    enabled: boolean
    frequency: number
    lastScheduledAt: string | null
  }
  slot: {
    dayPair: string | null
    dayPairLabel: string | null
    timeSlot: number | null
    timeSlotLabel: string | null
  }
  capacity: {
    total: number
    used: number
    available: number
  }
  paaQueue: {
    unused: number
    total: number
  }
  locations: {
    active: number
  }
  upcoming: {
    count: number
  }
}

// Convert slot index to Mountain Time display
const SLOT_TO_MOUNTAIN_TIME: Record<number, string> = {
  0: '7:00 AM',
  1: '8:00 AM',
  2: '9:00 AM',
  3: '10:00 AM',
  4: '11:00 AM',
  5: '1:00 PM',
  6: '2:00 PM',
  7: '3:00 PM',
  8: '4:00 PM',
  9: '5:00 PM',
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
  const [isFetching, setIsFetching] = useState(false)
  const [status, setStatus] = useState<AutoScheduleStatus | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Fetch status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchStatus()
    }
  }, [isOpen])

  const fetchStatus = async () => {
    setIsFetching(true)
    setFetchError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/auto-schedule`)
      const data = await response.json()
      if (response.ok) {
        setStatus(data)
      } else {
        setFetchError(data.error || `Failed to load (${response.status})`)
      }
    } catch (error) {
      console.error('Failed to fetch auto-schedule status:', error)
      setFetchError(error instanceof Error ? error.message : 'Network error')
    } finally {
      setIsFetching(false)
    }
  }

  const handleToggle = async () => {
    if (!status) return

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/auto-schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.automation.enabled }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: data.automation.enabled
            ? `Auto-schedule enabled${data.slot?.justAssigned ? ` - Assigned to ${data.slot.dayPairLabel}` : ''}`
            : 'Auto-schedule disabled'
        })
        // Refresh status
        await fetchStatus()
        router.refresh()
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to update'
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

  const handleFrequencyChange = async (frequency: number) => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/auto-schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Frequency set to ${frequency}x per week`
        })
        await fetchStatus()
        router.refresh()
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to update'
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
    setFetchError(null)
  }

  const isEnabled = status?.automation.enabled ?? false

  return (
    <>
      <button
        className="px-1.5 py-1 h-7 inline-flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(true)}
        title={isEnabled ? `Auto-schedule: ${status?.slot.dayPairLabel || 'Enabled'}` : 'Auto-schedule disabled'}
      >
        <Calendar className={`h-4 w-4 ${isEnabled ? 'text-green-600' : 'text-gray-400'}`} />
        {isEnabled && (
          <span className="ml-1 text-xs text-green-600 font-medium">ON</span>
        )}
      </button>

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
              <h3 className="text-lg font-semibold text-gray-900">Auto Schedule</h3>
              <p className="text-sm text-gray-500 mt-1">{clientName}</p>
            </div>

            {/* Loading state */}
            {isFetching && !status && !fetchError && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}

            {/* Fetch error */}
            {fetchError && (
              <div className="mb-4 p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Failed to load schedule status</p>
                    <p className="text-sm mt-1">{fetchError}</p>
                  </div>
                </div>
                <button
                  onClick={fetchStatus}
                  className="mt-3 px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

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

            {status && (
              <>
                {/* Toggle */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Power className={`h-5 w-5 ${isEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className="font-medium text-gray-900">
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <button
                      onClick={handleToggle}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled ? 'bg-green-600' : 'bg-gray-300'
                      } ${isLoading ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Schedule slot */}
                {status.slot.dayPairLabel && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Schedule Slot</span>
                    </div>
                    <p className="text-blue-800 font-semibold">{status.slot.dayPairLabel}</p>
                    {status.slot.timeSlot !== null && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-blue-600">
                        <Clock className="h-3 w-3" />
                        {SLOT_TO_MOUNTAIN_TIME[status.slot.timeSlot] || status.slot.timeSlotLabel} MT
                      </div>
                    )}
                  </div>
                )}

                {/* Frequency */}
                {isEnabled && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Posts per week
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFrequencyChange(1)}
                        disabled={isLoading}
                        className={`flex-1 py-2 px-4 rounded-lg border font-medium transition-colors ${
                          status.automation.frequency === 1
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        1x
                      </button>
                      <button
                        onClick={() => handleFrequencyChange(2)}
                        disabled={isLoading}
                        className={`flex-1 py-2 px-4 rounded-lg border font-medium transition-colors ${
                          status.automation.frequency === 2
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        2x
                      </button>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">{status.paaQueue.unused}</div>
                    <div className="text-xs text-gray-500">Questions left</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">{status.locations.active}</div>
                    <div className="text-xs text-gray-500">Locations</div>
                  </div>
                </div>

                {/* Capacity info */}
                <div className="text-xs text-gray-500 text-center">
                  System capacity: {status.capacity.used}/{status.capacity.total} slots used
                </div>

                {/* Last scheduled */}
                {status.automation.lastScheduledAt && (
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    Last run: {new Date(status.automation.lastScheduledAt).toLocaleDateString()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
