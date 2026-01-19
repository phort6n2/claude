'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Playlist {
  id: string
  title: string
  description?: string
  itemCount?: number
  thumbnailUrl?: string
}

interface Client {
  id: string
  businessName: string
  wrhqYoutubePlaylistId: string | null
  wrhqYoutubePlaylistTitle: string | null
}

interface ApiResponse {
  connected: boolean
  playlists: Playlist[]
  clients: Client[]
  unassignedClients: string[]
  error?: string
}

export default function YouTubeAdminPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch playlists and clients in parallel
      const [playlistsRes, clientsRes] = await Promise.all([
        fetch('/api/settings/wrhq/youtube/playlists'),
        fetch('/api/clients'),
      ])

      const playlistsData = await playlistsRes.json()
      const clientsData = await clientsRes.json()

      if (!playlistsRes.ok) {
        throw new Error(playlistsData.error || 'Failed to load playlists')
      }

      // Format clients data
      const clients: Client[] = (Array.isArray(clientsData) ? clientsData : [])
        .filter((c: { status?: string }) => c.status === 'ACTIVE')
        .map((c: {
          id: string
          businessName: string
          wrhqYoutubePlaylistId?: string | null
          wrhqYoutubePlaylistTitle?: string | null
        }) => ({
          id: c.id,
          businessName: c.businessName,
          wrhqYoutubePlaylistId: c.wrhqYoutubePlaylistId || null,
          wrhqYoutubePlaylistTitle: c.wrhqYoutubePlaylistTitle || null,
        }))
        .sort((a: Client, b: Client) => a.businessName.localeCompare(b.businessName))

      const unassignedClients = clients
        .filter((c: Client) => !c.wrhqYoutubePlaylistId)
        .map((c: Client) => c.businessName)

      setData({
        connected: playlistsData.connected,
        playlists: playlistsData.playlists || [],
        clients,
        unassignedClients,
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAssign = async (clientId: string, playlistId: string) => {
    const playlist = data?.playlists.find(p => p.id === playlistId)
    setSaving(clientId)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wrhqYoutubePlaylistId: playlistId || null,
          wrhqYoutubePlaylistTitle: playlist?.title || null,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update')
      }

      setSuccessMessage(`Updated client to use playlist "${playlist?.title || 'None'}"`)
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
            <h1 className="text-2xl font-bold text-gray-900">YouTube Playlist Assignments</h1>
          </div>
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading playlists and clients...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">YouTube Playlist Assignments</h1>
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

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">YouTube Playlist Assignments</h1>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <p className="text-amber-800 font-medium">YouTube is not configured</p>
            <p className="text-amber-700 text-sm mt-1">
              Please configure YouTube API credentials in Settings → API Settings first.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const unassignedCount = data?.clients.filter(c => !c.wrhqYoutubePlaylistId).length || 0

  // Build mapping of playlist ID to clients
  const playlistToClients: Record<string, string[]> = {}
  for (const client of data?.clients || []) {
    if (client.wrhqYoutubePlaylistId) {
      if (!playlistToClients[client.wrhqYoutubePlaylistId]) {
        playlistToClients[client.wrhqYoutubePlaylistId] = []
      }
      playlistToClients[client.wrhqYoutubePlaylistId].push(client.businessName)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/admin/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">YouTube Playlist Assignments</h1>
        </div>
        <p className="text-gray-600 mb-6 ml-12">
          Assign each client to their WRHQ YouTube playlist for video uploads.
        </p>

        {unassignedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800 font-medium">
              {unassignedCount} client{unassignedCount > 1 ? 's' : ''} without playlist assignment
            </p>
            <p className="text-amber-700 text-sm mt-1">
              Unassigned clients won&apos;t have videos added to a playlist.
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

        {/* Available Playlists */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Available Playlists</h2>
          </div>
          <div className="p-6">
            {data?.playlists.length === 0 ? (
              <p className="text-gray-500 text-sm">No playlists found in the YouTube account.</p>
            ) : (
              <div className="grid gap-3">
                {data?.playlists.map(playlist => (
                  <div key={playlist.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    {playlist.thumbnailUrl && (
                      <img src={playlist.thumbnailUrl} alt="" className="w-16 h-9 rounded object-cover" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{playlist.title}</p>
                      <p className="text-xs text-gray-500 font-mono">{playlist.id}</p>
                      {playlist.itemCount !== undefined && (
                        <p className="text-xs text-gray-500">{playlist.itemCount} videos</p>
                      )}
                    </div>
                    {playlistToClients[playlist.id]?.length > 0 && (
                      <span className="text-sm text-green-600">
                        {playlistToClients[playlist.id].length} client{playlistToClients[playlist.id].length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
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
                    {client.wrhqYoutubePlaylistTitle && (
                      <p className="text-sm text-gray-500">
                        Currently: {client.wrhqYoutubePlaylistTitle}
                      </p>
                    )}
                    {!client.wrhqYoutubePlaylistId && (
                      <p className="text-sm text-amber-600 font-medium">
                        Not assigned - videos won&apos;t be added to playlist
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={client.wrhqYoutubePlaylistId || ''}
                      onChange={(e) => handleAssign(client.id, e.target.value)}
                      disabled={saving === client.id}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 min-w-[250px]"
                    >
                      <option value="">Select a playlist...</option>
                      {data?.playlists.map(playlist => (
                        <option key={playlist.id} value={playlist.id}>
                          {playlist.title}
                        </option>
                      ))}
                    </select>
                    {saving === client.id && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                    )}
                    {client.wrhqYoutubePlaylistId && saving !== client.id && (
                      <span className="text-green-600">&#10003;</span>
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
