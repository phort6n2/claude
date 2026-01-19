'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import {
  Building2,
  MapPin,
  ChevronRight,
  Loader2,
  Sparkles,
  CheckCircle,
  HelpCircle,
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

export default function ContentForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [nextPAA, setNextPAA] = useState<ClientPAA | null>(null)
  const [locations, setLocations] = useState<ServiceLocation[]>([])

  const [clientId, setClientId] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')

  // Fetch clients on mount
  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(console.error)
  }, [])

  // Fetch next PAA and locations when client changes
  useEffect(() => {
    if (clientId) {
      setLoadingData(true)
      setNextPAA(null)
      Promise.all([
        fetch(`/api/clients/${clientId}/paas`).then(res => res.json()),
        fetch(`/api/clients/${clientId}/locations`).then(res => res.json()),
      ])
        .then(([paasResponse, locs]) => {
          // PAAs API returns { paas: [...] }, locations returns [...] directly
          const paas = paasResponse.paas || paasResponse || []
          const paaList = Array.isArray(paas) ? paas : []

          // Get the first unused PAA (sorted by priority, least used first)
          if (paaList.length > 0) {
            // Sort by usedCount (ascending), then by priority (ascending)
            const sorted = [...paaList].sort((a, b) => {
              if (a.usedCount !== b.usedCount) return a.usedCount - b.usedCount
              return a.priority - b.priority
            })
            setNextPAA(sorted[0])
          }

          setLocations(Array.isArray(locs) ? locs : [])
          setSelectedLocation('')
        })
        .catch((err) => {
          console.error('Error fetching client data:', err)
          setNextPAA(null)
          setLocations([])
        })
        .finally(() => setLoadingData(false))
    } else {
      setNextPAA(null)
      setLocations([])
    }
  }, [clientId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nextPAA) {
      setError('No PAA questions available for this client')
      return
    }

    setLoading(true)
    setError('')

    const client = clients.find(c => c.id === clientId)
    const today = new Date().toISOString().split('T')[0]

    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientPAAId: nextPAA.id,
          serviceLocationId: selectedLocation || null,
          paaQuestion: nextPAA.question,
          scheduledDate: today,
          scheduledTime: client?.preferredPublishTime || '09:00',
          status: 'GENERATING',
          triggerGeneration: true,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create content')
      }

      const data = await response.json()

      if (data.id) {
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

  const isFormValid = clientId && nextPAA

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
      {clientId && locations.length > 0 && (
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

      {/* Show Next PAA Preview */}
      {clientId && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-xl">
                <HelpCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Next PAA Question</h3>
                <p className="text-sm text-gray-500">This question will be used for content generation</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {loadingData ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              </div>
            ) : nextPAA ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-amber-900 font-medium">{nextPAA.question}</p>
                {nextPAA.usedCount > 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    Previously used {nextPAA.usedCount} time{nextPAA.usedCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">
                  No PAA questions available for this client.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Add PAA questions in the client settings first.
                </p>
              </div>
            )}
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
            className="px-8 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/25"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Content
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  )
}
