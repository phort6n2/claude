'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Zap, Calendar } from 'lucide-react'

interface Client {
  id: string
  businessName: string
  preferredPublishTime: string
}

interface ClientPAA {
  id: string
  question: string
  priority: number
}

interface ServiceLocation {
  id: string
  city: string
  state: string
  neighborhood: string | null
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
        .then(([paas, locs]) => {
          setPaaQuestions(paas)
          setLocations(locs)
          setSelectedPAA('')
          setSelectedLocation('')
        })
        .catch(console.error)
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
    return loc.neighborhood ? `${loc.neighborhood}, ${loc.city}` : `${loc.city}, ${loc.state}`
  }

  const isFormValid = clientId && (useCustom ? customQuestion.trim() : selectedPAA)

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client *
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.businessName}
                </option>
              ))}
            </select>
          </div>

          {/* Location Selection */}
          {clientId && locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location (optional)
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loadingData}
              >
                <option value="">No specific location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {getLocationLabel(loc)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PAA Question Selection */}
          {clientId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  PAA Question *
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustom(!useCustom)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {useCustom ? 'Use saved question' : 'Write custom'}
                </button>
              </div>

              {useCustom ? (
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Enter your PAA question..."
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
              ) : (
                <select
                  value={selectedPAA}
                  onChange={(e) => setSelectedPAA(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loadingData}
                  required
                >
                  <option value="">Select a question</option>
                  {paaQuestions.map((paa) => (
                    <option key={paa.id} value={paa.id}>
                      {paa.question}
                    </option>
                  ))}
                </select>
              )}

              {!useCustom && paaQuestions.length === 0 && !loadingData && (
                <p className="text-sm text-gray-500 mt-1">
                  No PAA questions found. Add questions in the client settings or write a custom question.
                </p>
              )}
            </div>
          )}

          {/* Publish Option */}
          {clientId && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When to publish
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPublishNow(false)}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    !publishNow
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Calendar className="h-5 w-5" />
                  <span className="font-medium">Schedule</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPublishNow(true)}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    publishNow
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Zap className="h-5 w-5" />
                  <span className="font-medium">Create Now</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {publishNow
                  ? 'Content will be generated immediately and ready for review.'
                  : 'Content will be scheduled for the next Tuesday or Thursday.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || !isFormValid}
          className={publishNow ? 'bg-green-600 hover:bg-green-700' : ''}
        >
          {loading
            ? (publishNow ? 'Creating...' : 'Scheduling...')
            : isEditing
              ? 'Update Content'
              : (publishNow ? 'Create Now' : 'Schedule Content')}
        </Button>
      </div>
    </form>
  )
}
