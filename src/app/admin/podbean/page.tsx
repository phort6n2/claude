'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Podcast {
  id: string
  title: string
  logo?: string
  assignedClients: string[]
}

interface Client {
  id: string
  businessName: string
  podbeanPodcastId: string | null
  podbeanPodcastTitle: string | null
  status: string
}

interface ApiResponse {
  success: boolean
  podcasts: Podcast[]
  clients: Client[]
  unassignedClients: string[]
  error?: string
}

export default function PodbeanAdminPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // client ID being saved
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/podbean-podcasts')
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to load data')
      }
      setData(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAssign = async (clientId: string, podcastId: string) => {
    if (!podcastId) return

    const podcast = data?.podcasts.find(p => p.id === podcastId)
    setSaving(clientId)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/podbean-podcasts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          podcastId,
          podcastTitle: podcast?.title || null,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update')
      }

      setSuccessMessage(result.message)
      // Refresh data
      await fetchData()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Podbean Podcast Assignments</h1>
          </div>
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading podcasts and clients...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Podbean Podcast Assignments</h1>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  const unassignedCount = data?.clients.filter(c => !c.podbeanPodcastId).length || 0

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/admin/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Podbean Podcast Assignments</h1>
        </div>
        <p className="text-gray-600 mb-6 ml-12">
          Assign each client to their correct Podbean podcast to ensure episodes publish to the right show.
        </p>

        {unassignedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800 font-medium">
              {unassignedCount} client{unassignedCount > 1 ? 's' : ''} without podcast assignment
            </p>
            <p className="text-amber-700 text-sm mt-1">
              Unassigned clients will publish to the default podcast, which may be incorrect.
            </p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Available Podcasts */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Available Podcasts</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-3">
              {data?.podcasts.map(podcast => (
                <div key={podcast.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  {podcast.logo && (
                    <img src={podcast.logo} alt="" className="w-10 h-10 rounded" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{podcast.title}</p>
                    <p className="text-xs text-gray-500 font-mono">{podcast.id}</p>
                  </div>
                  {podcast.assignedClients.length > 0 && (
                    <span className="text-sm text-green-600">
                      {podcast.assignedClients.length} client{podcast.assignedClients.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Client Assignments */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Client Assignments</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.clients.map(client => (
              <div key={client.id} className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{client.businessName}</p>
                    {client.podbeanPodcastTitle && (
                      <p className="text-sm text-gray-500">
                        Currently: {client.podbeanPodcastTitle}
                      </p>
                    )}
                    {!client.podbeanPodcastId && (
                      <p className="text-sm text-amber-600 font-medium">
                        Not assigned - will use default podcast
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={client.podbeanPodcastId || ''}
                      onChange={(e) => handleAssign(client.id, e.target.value)}
                      disabled={saving === client.id}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[250px]"
                    >
                      <option value="">Select a podcast...</option>
                      {data?.podcasts.map(podcast => (
                        <option key={podcast.id} value={podcast.id}>
                          {podcast.title}
                        </option>
                      ))}
                    </select>
                    {saving === client.id && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    )}
                    {client.podbeanPodcastId && saving !== client.id && (
                      <span className="text-green-600">✓</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
