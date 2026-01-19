'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import {
  Zap,
  Calendar,
  Building2,
  MapPin,
  HelpCircle,
  ChevronRight,
  Loader2,
  Sparkles,
  Clock,
  CheckCircle,
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  preferredPublishTime: string
  primaryColor: string | null
}

interface ClientPAA {
  id: string
  question: string
  priority: number
  usedAt: string | null
  usedCount: number
}

interface ServiceLocation {
  id: string
  city: string
  state: string
  neighborhood: string | null
  isHeadquarters: boolean
}

interface ContentFormProps {
  initialData?: {
    id?: string
    clientId?: string
    paaQuestion?: string
    serviceLocationId?: string
  }
  isEditing?: boolean
}

export default function ContentForm({ initialData, isEditing = false }: ContentFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [paaQuestions, setPaaQuestions] = useState<ClientPAA[]>([])
  const [locations, setLocations] = useState<ServiceLocation[]>([])

  const [clientId, setClientId] = useState(initialData?.clientId || '')
  const [selectedPAA, setSelectedPAA] = useState('')
  const [customQuestion, setCustomQuestion] = useState(initialData?.paaQuestion || '')
  const [useCustom, setUseCustom] = useState(!!initialData?.paaQuestion)
  const [selectedLocation, setSelectedLocation] = useState(initialData?.serviceLocationId || '')
  const [publishNow, setPublishNow] = useState(false)

  const selectedClient = clients.find(c => c.id === clientId)

  // Fetch clients on mount
  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(console.error)
  }, [])

  // Fetch PAAs and locations when client changes
  useEffect(() => {
    if (clientId) {
      setLoadingData(true)
      Promise.all([
        fetch(`/api/clients/${clientId}/paas`).then(res => res.json()),
        fetch(`/api/clients/${clientId}/locations`).then(res => res.json()),
      ])
        .then(([paasResponse, locs]) => {
          // PAAs API returns { paas: [...] }, locations returns [...] directly
          const paas = paasResponse.paas || paasResponse || []
          setPaaQuestions(Array.isArray(paas) ? paas : [])
          setLocations(Array.isArray(locs) ? locs : [])
          setSelectedPAA('')
          setSelectedLocation('')
        })
        .catch((err) => {
          console.error('Error fetching client data:', err)
          setPaaQuestions([])
          setLocations([])
        })
        .finally(() => setLoadingData(false))
    } else {
      setPaaQuestions([])
      setLocations([])
    }
  }, [clientId])

  // Get next available Tuesday or Thursday
  const getNextPublishDate = () => {
    const today = new Date()
    const day = today.getDay()
    let daysToAdd = 0

    if (day === 0) daysToAdd = 2 // Sunday -> Tuesday
    else if (day === 1) daysToAdd = 1 // Monday -> Tuesday
    else if (day === 2) daysToAdd = 2 // Tuesday -> Thursday
    else if (day === 3) daysToAdd = 1 // Wednesday -> Thursday
    else if (day === 4) daysToAdd = 5 // Thursday -> Tuesday
    else if (day === 5) daysToAdd = 4 // Friday -> Tuesday
    else if (day === 6) daysToAdd = 3 // Saturday -> Tuesday

    const nextDate = new Date(today)
    nextDate.setDate(today.getDate() + daysToAdd)
    return nextDate.toISOString().split('T')[0]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const question = useCustom ? customQuestion : paaQuestions.find(p => p.id === selectedPAA)?.question
    if (!question) {
      setError('Please select or enter a PAA question')
      setLoading(false)
      return
    }

    const client = clients.find(c => c.id === clientId)
    const today = new Date().toISOString().split('T')[0]

    try {
      const url = isEditing ? `/api/content/${initialData?.id}` : '/api/content'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientPAAId: useCustom ? null : selectedPAA,
          serviceLocationId: selectedLocation || null,
          paaQuestion: question,
          scheduledDate: publishNow ? today : getNextPublishDate(),
          scheduledTime: client?.preferredPublishTime || '09:00',
          status: publishNow ? 'GENERATING' : 'DRAFT',
          triggerGeneration: publishNow,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save content')
      }

      const data = await response.json()

      if (publishNow && data.id) {
        // Redirect to review page for immediate content
        router.push(`/admin/content/${data.id}/review`)
      } else {
        router.push('/admin/content')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getLocationLabel = (loc: ServiceLocation) => {
    const label = loc.neighborhood ? `${loc.neighborhood}, ${loc.city}` : `${loc.city}, ${loc.state}`
    return loc.isHeadquarters ? `${label} (HQ)` : label
  }

  const isFormValid = clientId && (useCustom ? customQuestion.trim() : selectedPAA)

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Select Client */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Select Client</h3>
              <p className="text-sm text-gray-500">Choose which client this content is for</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {clients.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setClientId(client.id)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    clientId === client.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
                    style={{ backgroundColor: client.primaryColor || '#1e40af' }}
                  >
                    {client.businessName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${clientId === client.id ? 'text-blue-900' : 'text-gray-900'}`}>
                      {client.businessName}
                    </p>
                  </div>
                  {clientId === client.id && (
                    <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Location (if client selected and has locations) */}
      {clientId && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-xl">
                <MapPin className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Target Location</h3>
                <p className="text-sm text-gray-500">Optional: target a specific service area</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {loadingData ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              </div>
            ) : locations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No service locations configured for this client
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLocation('')}
                  className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    !selectedLocation
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Any Location
                </button>
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => setSelectedLocation(loc.id)}
                    className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all truncate ${
                      selectedLocation === loc.id
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {getLocationLabel(loc)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: PAA Question */}
      {clientId && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl">
                  <HelpCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">PAA Question</h3>
                  <p className="text-sm text-gray-500">The question this content will answer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseCustom(!useCustom)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {useCustom ? 'Use saved question' : 'Write custom'}
              </button>
            </div>
          </div>
          <div className="p-6">
            {loadingData ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              </div>
            ) : useCustom ? (
              <textarea
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="Enter your PAA question... (e.g., How much does windshield replacement cost in {location}?)"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                rows={3}
                required
              />
            ) : paaQuestions.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-2">
                  No PAA questions found for this client.
                </p>
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Write a custom question instead
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {paaQuestions.map((paa) => (
                  <button
                    key={paa.id}
                    type="button"
                    onClick={() => setSelectedPAA(paa.id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      selectedPAA === paa.id
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedPAA === paa.id
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedPAA === paa.id && (
                        <CheckCircle className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${selectedPAA === paa.id ? 'text-amber-900 font-medium' : 'text-gray-700'}`}>
                        {paa.question}
                      </p>
                      {paa.usedCount > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Used {paa.usedCount} time{paa.usedCount !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: When to Publish */}
      {clientId && (useCustom ? customQuestion.trim() : selectedPAA) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-xl">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">When to Create</h3>
                <p className="text-sm text-gray-500">Schedule for later or generate immediately</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPublishNow(false)}
                className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                  !publishNow
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`p-3 rounded-xl ${!publishNow ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Calendar className={`h-6 w-6 ${!publishNow ? 'text-blue-600' : 'text-gray-500'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-semibold ${!publishNow ? 'text-blue-900' : 'text-gray-700'}`}>
                    Schedule
                  </p>
                  <p className={`text-xs mt-1 ${!publishNow ? 'text-blue-600' : 'text-gray-500'}`}>
                    Next Tue/Thu
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPublishNow(true)}
                className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                  publishNow
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`p-3 rounded-xl ${publishNow ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Zap className={`h-6 w-6 ${publishNow ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-semibold ${publishNow ? 'text-green-900' : 'text-gray-700'}`}>
                    Create Now
                  </p>
                  <p className={`text-xs mt-1 ${publishNow ? 'text-green-600' : 'text-gray-500'}`}>
                    Generate immediately
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {clientId && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !isFormValid}
            className={`px-8 ${
              publishNow
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/25'
                : 'shadow-lg shadow-blue-500/25'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {publishNow ? 'Creating...' : 'Scheduling...'}
              </>
            ) : (
              <>
                {publishNow ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create Now
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Content
                  </>
                )}
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  )
}
