'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface GBPConfig {
  id: string
  enabled: boolean
  frequency: string
  preferredDays: number[]
  preferredTime: string
  rotationLinks: RotationLink[] | null
  postTopics: string[]
  includePromo: boolean
  includePhone: boolean
  useAiGeneratedImages: boolean
  isGoogleConnected: boolean
  currentLinkIndex: number
}

interface RotationLink {
  url: string
  label: string
  type: string
  weight?: number
}

interface GBPPost {
  id: string
  content: string
  photoUrl: string | null
  status: string
  createdAt: string
  publishedAt: string | null
  platformPostUrl: string | null
  rotationLinkLabel: string | null
}

interface GBPPhoto {
  name: string
  mediaUrl: string
  thumbnailUrl?: string
  category: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FREQUENCIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'TWICE_WEEKLY', label: 'Twice Weekly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Every 2 Weeks' },
  { value: 'MONTHLY', label: 'Monthly' },
]
const LINK_TYPES = [
  { value: 'service_page', label: 'Service Page' },
  { value: 'blog', label: 'Blog' },
  { value: 'wrhq', label: 'WRHQ Listing' },
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'citation', label: 'Citation' },
  { value: 'custom', label: 'Custom' },
]

export default function ClientGBPPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clientId = params.id as string

  const [config, setConfig] = useState<GBPConfig | null>(null)
  const [posts, setPosts] = useState<GBPPost[]>([])
  const [photos, setPhotos] = useState<GBPPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [newLink, setNewLink] = useState({ url: '', label: '', type: 'service_page' })
  const [newTopic, setNewTopic] = useState('')

  // Check for OAuth callback messages
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'connected') {
      setMessage({ type: 'success', text: 'Google account connected successfully!' })
    } else if (error) {
      setMessage({ type: 'error', text: `OAuth error: ${error}` })
    }
  }, [searchParams])

  // Load data
  useEffect(() => {
    loadData()
  }, [clientId])

  async function loadData() {
    try {
      const [configRes, postsRes, photosRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/gbp-config`),
        fetch(`/api/clients/${clientId}/gbp-posts?limit=10`),
        fetch(`/api/clients/${clientId}/gbp-photos`),
      ])

      if (configRes.ok) {
        const data = await configRes.json()
        setConfig(data)
      }

      if (postsRes.ok) {
        const data = await postsRes.json()
        setPosts(data.posts || [])
      }

      if (photosRes.ok) {
        const data = await photosRes.json()
        setPhotos(data.photos || [])
      }
    } catch (error) {
      console.error('Failed to load GBP data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    if (!config) return

    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          frequency: config.frequency,
          preferredDays: config.preferredDays,
          preferredTime: config.preferredTime,
          rotationLinks: config.rotationLinks,
          postTopics: config.postTopics,
          includePromo: config.includePromo,
          includePhone: config.includePhone,
          useAiGeneratedImages: config.useAiGeneratedImages,
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Settings saved!' })
      } else {
        throw new Error('Failed to save')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  async function connectGoogle() {
    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-config/oauth?action=connect`)
      const data = await res.json()

      if (res.ok && data.oauthUrl) {
        window.location.href = data.oauthUrl
      } else if (data.needsConfiguration) {
        setMessage({
          type: 'error',
          text: 'GBP OAuth not configured. Please add GBP_CLIENT_ID and GBP_CLIENT_SECRET in Settings → API Settings first.',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to start OAuth flow' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to start OAuth flow. Check your network connection.' })
    }
  }

  async function disconnectGoogle() {
    if (!confirm('Are you sure you want to disconnect Google? Cached photos will be removed.')) {
      return
    }

    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-config/oauth`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, isGoogleConnected: false } : null)
        setPhotos([])
        setMessage({ type: 'success', text: 'Google account disconnected' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect' })
    }
  }

  async function refreshPhotos() {
    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-photos`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setPhotos(data.photos || [])
        setMessage({ type: 'success', text: `Refreshed ${data.count} photos` })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to refresh photos' })
    }
  }

  async function generatePost() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      })

      if (res.ok) {
        const data = await res.json()
        setPosts(prev => [data.post, ...prev])
        setMessage({ type: 'success', text: 'Post generated! Review and publish below.' })
      } else {
        throw new Error('Failed to generate')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to generate post' })
    } finally {
      setGenerating(false)
    }
  }

  async function publishPost(postId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', postId }),
      })

      if (res.ok) {
        const data = await res.json()
        setPosts(prev => prev.map(p => p.id === postId ? data.post : p))
        setMessage({ type: 'success', text: 'Post published!' })
      } else {
        throw new Error('Failed to publish')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to publish post' })
    }
  }

  async function deletePost(postId: string) {
    if (!confirm('Delete this post?')) return

    try {
      const res = await fetch(`/api/clients/${clientId}/gbp-posts?postId=${postId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId))
        setMessage({ type: 'success', text: 'Post deleted' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete post' })
    }
  }

  function addRotationLink() {
    if (!newLink.url || !newLink.label || !config) return

    setConfig({
      ...config,
      rotationLinks: [...(config.rotationLinks || []), newLink],
    })
    setNewLink({ url: '', label: '', type: 'service_page' })
  }

  function removeRotationLink(index: number) {
    if (!config) return
    setConfig({
      ...config,
      rotationLinks: (config.rotationLinks || []).filter((_, i) => i !== index),
    })
  }

  function addTopic() {
    if (!newTopic || !config) return
    setConfig({
      ...config,
      postTopics: [...config.postTopics, newTopic],
    })
    setNewTopic('')
  }

  function removeTopic(index: number) {
    if (!config) return
    setConfig({
      ...config,
      postTopics: config.postTopics.filter((_, i) => i !== index),
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse bg-white rounded-lg shadow p-6">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/admin/clients/${clientId}`} className="text-blue-600 hover:underline text-sm">
              &larr; Back to Client
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">GBP Posting Settings</h1>
          </div>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Configuration */}
          <div className="space-y-6">
            {/* Enable/Schedule Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Posting Schedule</h2>

              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={config?.enabled ?? false}
                  onChange={e => setConfig(prev => prev ? { ...prev, enabled: e.target.checked } : null)}
                  className="w-5 h-5 rounded"
                />
                <span className="font-medium">Enable Automated GBP Posting</span>
              </label>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={config?.frequency ?? 'WEEKLY'}
                    onChange={e => setConfig(prev => prev ? { ...prev, frequency: e.target.value } : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {FREQUENCIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Time (UTC)</label>
                  <input
                    type="time"
                    value={config?.preferredTime ?? '10:00'}
                    onChange={e => setConfig(prev => prev ? { ...prev, preferredTime: e.target.value } : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day, idx) => (
                      <label key={day} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={config?.preferredDays?.includes(idx) ?? false}
                          onChange={e => {
                            if (!config) return
                            const days = e.target.checked
                              ? [...config.preferredDays, idx]
                              : config.preferredDays.filter(d => d !== idx)
                            setConfig({ ...config, preferredDays: days })
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm">{day.slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Content Settings Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Content Settings</h2>

              <div className="space-y-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config?.includePromo ?? true}
                    onChange={e => setConfig(prev => prev ? { ...prev, includePromo: e.target.checked } : null)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Include promotional messaging</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config?.includePhone ?? true}
                    onChange={e => setConfig(prev => prev ? { ...prev, includePhone: e.target.checked } : null)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Reference phone number in posts</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config?.useAiGeneratedImages ?? false}
                    onChange={e => setConfig(prev => prev ? { ...prev, useAiGeneratedImages: e.target.checked } : null)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Use AI-generated images when no GBP photos available</span>
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Post Topics</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    placeholder="e.g., windshield repair tips"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button
                    onClick={addTopic}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {config?.postTopics.map((topic, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                      {topic}
                      <button onClick={() => removeTopic(idx)} className="text-blue-600 hover:text-blue-800">&times;</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Link Rotation Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Link Rotation</h2>
              <p className="text-sm text-gray-600 mb-4">Add links to rotate through for the CTA button.</p>

              <div className="space-y-2 mb-4">
                <input
                  type="url"
                  value={newLink.url}
                  onChange={e => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLink.label}
                    onChange={e => setNewLink(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="Label (e.g., Windshield Repair)"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <select
                    value={newLink.type}
                    onChange={e => setNewLink(prev => ({ ...prev, type: e.target.value }))}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    {LINK_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={addRotationLink}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {(config?.rotationLinks || []).map((link, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-2 rounded border ${idx === config?.currentLinkIndex ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{link.label}</div>
                      <div className="text-xs text-gray-500 truncate">{link.url}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">{link.type}</span>
                      {idx === config?.currentLinkIndex && (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">Next</span>
                      )}
                      <button
                        onClick={() => removeRotationLink(idx)}
                        className="text-red-600 hover:text-red-800"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Google Connection & Posts */}
          <div className="space-y-6">
            {/* Google Connection Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Google Business Profile Photos</h2>

              {config?.isGoogleConnected ? (
                <div>
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Google Account Connected</span>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={refreshPhotos}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      Refresh Photos
                    </button>
                    <button
                      onClick={disconnectGoogle}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                    >
                      Disconnect
                    </button>
                  </div>

                  {photos.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.slice(0, 8).map((photo, idx) => (
                        <div key={idx} className="aspect-square bg-gray-100 rounded overflow-hidden">
                          <img
                            src={photo.thumbnailUrl || photo.mediaUrl}
                            alt={photo.category}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No photos found. Click refresh to fetch from GBP.</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Connect your Google account to pull photos from your Business Profile for use in posts.
                    This is optional - posts can also use AI-generated images.
                  </p>
                  <button
                    onClick={connectGoogle}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Connect Google Account
                  </button>
                  <p className="text-xs text-gray-500 mt-3">
                    Note: Requires <Link href="/admin/settings/api" className="text-blue-600 hover:underline">GBP OAuth credentials</Link> to be configured first.
                  </p>
                </div>
              )}
            </div>

            {/* Generate Post Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Create Post</h2>

              <button
                onClick={generatePost}
                disabled={generating}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate AI Post'}
              </button>

              <p className="text-sm text-gray-500 mt-2">
                Creates a new draft post using AI. You can review and edit before publishing.
              </p>
            </div>

            {/* Recent Posts Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Posts</h2>

              {posts.length === 0 ? (
                <p className="text-sm text-gray-500">No posts yet. Generate your first post above!</p>
              ) : (
                <div className="space-y-4">
                  {posts.map(post => (
                    <div key={post.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          post.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                          post.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                          post.status === 'SCHEDULED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {post.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 line-clamp-3 mb-3">{post.content}</p>

                      {post.rotationLinkLabel && (
                        <div className="text-xs text-gray-500 mb-2">
                          CTA: {post.rotationLinkLabel}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {post.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => publishPost(post.id)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              Publish Now
                            </button>
                            <button
                              onClick={() => deletePost(post.id)}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {post.status === 'PUBLISHED' && post.platformPostUrl && (
                          <a
                            href={post.platformPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
                          >
                            View on GBP
                          </a>
                        )}
                        {post.status === 'FAILED' && (
                          <button
                            onClick={() => deletePost(post.id)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
