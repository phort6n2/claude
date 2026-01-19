'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { X, Loader2, Zap, CheckCircle, AlertCircle } from 'lucide-react'

interface Client {
  id: string
  businessName: string
  preferredPublishTime: string
}

interface ServiceLocation {
  id: string
  city: string
  state: string
  neighborhood: string | null
}

interface ClientPAA {
  id: string
  question: string
  priority: number
  usedAt: string | null
  usedCount: number
}

interface CreateContentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CreateContentModal({ isOpen, onClose, onSuccess }: CreateContentModalProps) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [locations, setLocations] = useState<ServiceLocation[]>([])
  const [paaQuestions, setPaaQuestions] = useState<ClientPAA[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; contentId?: string } | null>(null)

  const [selectedClient, setSelectedClient] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [selectedPAA, setSelectedPAA] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  // Fetch clients on mount
  useEffect(() => {
    if (isOpen) {
      fetch('/api/clients')
        .then(res => res.json())
        .then(setClients)
        .catch(console.error)
    }
  }, [isOpen])

  // Fetch locations and PAAs when client changes
  useEffect(() => {
    if (selectedClient) {
      setLoading(true)
      Promise.all([
        fetch(`/api/clients/${selectedClient}/locations`).then(res => res.json()),
        fetch(`/api/clients/${selectedClient}/paas`).then(res => res.json()),
      ])
        .then(([locs, paasResponse]) => {
          setLocations(locs)
          // API returns { paas: [...] }, and filter to only show unused PAAs
          const allPaas = paasResponse.paas || paasResponse || []
          const unusedPaas = allPaas.filter((p: ClientPAA) => !p.usedAt)
          setPaaQuestions(unusedPaas)
          setSelectedLocation('')
          setSelectedPAA('')
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    } else {
      setLocations([])
      setPaaQuestions([])
    }
  }, [selectedClient])

  const handleCreate = async () => {
    const question = useCustom ? customQuestion : paaQuestions.find(p => p.id === selectedPAA)?.question
    if (!selectedClient || !question) return

    setGenerating(true)
    setResult(null)

    try {
      // Create content item with today's date and trigger generation
      const today = new Date().toISOString().split('T')[0]
      const client = clients.find(c => c.id === selectedClient)

      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient,
          serviceLocationId: selectedLocation || null,
          clientPAAId: useCustom ? null : selectedPAA,
          paaQuestion: question,
          scheduledDate: today,
          scheduledTime: client?.preferredPublishTime || '09:00',
          status: 'DRAFT',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess()
        // Close modal and redirect to review page
        handleClose()
        router.push(`/admin/content/${data.id}/review`)
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to create content',
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Network error. Please try again.',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setSelectedClient('')
    setSelectedLocation('')
    setSelectedPAA('')
    setCustomQuestion('')
    setUseCustom(false)
    setResult(null)
    onClose()
  }

  const getLocationLabel = (loc: ServiceLocation) => {
    return loc.neighborhood ? `${loc.neighborhood}, ${loc.city}` : `${loc.city}, ${loc.state}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Create Content Now
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Generate a blog post immediately with all assets
          </p>
        </div>

        {/* Result message */}
        {result && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
            result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {result.success ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            )}
            <div>
              {result.message}
              {result.success && result.contentId && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      router.push(`/admin/content/${result.contentId}/review`)
                      handleClose()
                    }}
                  >
                    View Content
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client *
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={generating}
            >
              <option value="">Select a client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.businessName}
                </option>
              ))}
            </select>
          </div>

          {/* Location Selection */}
          {selectedClient && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location (optional)
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || generating}
              >
                <option value="">No specific location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {getLocationLabel(loc)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PAA Question Selection */}
          {selectedClient && (
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
                  rows={2}
                  disabled={generating}
                />
              ) : (
                <select
                  value={selectedPAA}
                  onChange={(e) => setSelectedPAA(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || generating}
                >
                  <option value="">Select a question</option>
                  {paaQuestions.map(paa => (
                    <option key={paa.id} value={paa.id}>
                      {paa.question}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
            <strong>What happens:</strong>
            <ul className="mt-1 space-y-1 text-xs">
              <li>• Blog post will be generated immediately</li>
              <li>• Images, social posts, and podcast will be created</li>
              <li>• Content will be ready for review in a few minutes</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={generating}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={generating || !selectedClient || (!useCustom && !selectedPAA) || (useCustom && !customQuestion.trim())}
            className="flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Create Now
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
