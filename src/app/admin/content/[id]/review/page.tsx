'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Image as ImageIcon,
  Share2,
  Building2,
  Mic,
  Video,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Layers,
  Play,
} from 'lucide-react'

interface ContentItem {
  id: string
  paaQuestion: string
  status: string
  lastError: string | null
  scheduledDate: string
  blogApproved: string
  imagesApproved: string
  socialApproved: string
  wrhqBlogApproved: string
  wrhqSocialApproved: string
  blogGenerated: boolean
  imagesGenerated: boolean
  socialGenerated: boolean
  wrhqBlogGenerated: boolean
  wrhqSocialGenerated: boolean
  clientBlogPublished: boolean
  clientBlogUrl: string | null
  wrhqBlogPublished: boolean
  wrhqBlogUrl: string | null
  podcastGenerated: boolean
  podcastStatus: string | null
  podcastDescription: string | null
  podcastAddedToPost: boolean
  podcastAddedAt: string | null
  shortVideoGenerated: boolean
  shortVideoStatus: string | null
  shortVideoDescription: string | null
  shortVideoAddedToPost: boolean
  longVideoUploaded: boolean
  longformVideoUrl: string | null
  longformVideoDesc: string | null
  longVideoAddedToPost: boolean
  mediaEmbeddedAt: string | null
  schemaGenerated: boolean
  schemaUpdateCount: number
  schemaLastUpdated: string | null
  completionPercent: number
  client: {
    id: string
    businessName: string
    slug: string
    city: string
    state: string
  }
  serviceLocation: {
    id: string
    city: string
    state: string
  } | null
  blogPost: {
    id: string
    title: string
    slug: string
    content: string
    excerpt: string | null
    metaTitle: string | null
    metaDescription: string | null
    wordCount: number | null
    wordpressUrl: string | null
    schemaJson: string | null
  } | null
  images: Array<{
    id: string
    imageType: string
    gcsUrl: string
    width: number
    height: number
    altText: string | null
    approved: boolean
  }>
  socialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: string[]
    approved: boolean
    status: string
    publishedUrl: string | null
    errorMessage: string | null
  }>
  wrhqSocialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: string[]
    approved: boolean
    status: string
    publishedUrl: string | null
    errorMessage: string | null
  }>
  wrhqBlogPost: {
    id: string
    title: string
    slug: string
    content: string
    excerpt: string | null
    metaTitle: string | null
    metaDescription: string | null
    wordCount: number | null
    wordpressUrl: string | null
    featuredImageUrl: string | null
  } | null
  podcast: {
    id: string
    audioUrl: string
    duration: number | null
    script: string | null
    description: string | null
    status: string
    podbeanUrl: string | null
    podbeanPlayerUrl: string | null
  } | null
  videos: Array<{
    id: string
    videoType: string
    videoUrl: string
    thumbnailUrl: string | null
    duration: number | null
    status: string
    creatifyJobId: string | null
  }>
  shortVideo: {
    id: string
    videoUrl: string
    thumbnailUrl: string | null
    duration: number | null
    status: string
    creatifyJobId: string | null
  } | null
  videoSocialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: string[]
    approved: boolean
    status: string
    publishedUrl: string | null
    errorMessage: string | null
  }>
  wrhqVideoSocialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: string[]
    approved: boolean
    status: string
    publishedUrl: string | null
    errorMessage: string | null
  }>
}

type Tab = 'review' | 'published'

const PLATFORM_ICONS: Record<string, string> = {
  FACEBOOK: '📘',
  INSTAGRAM: '📷',
  LINKEDIN: '💼',
  TWITTER: '🐦',
  TIKTOK: '🎵',
  GBP: '📍',
  YOUTUBE: '📺',
  BLUESKY: '🦋',
  THREADS: '🧵',
  REDDIT: '🤖',
  PINTEREST: '📌',
  TELEGRAM: '✈️',
}

export default function ContentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [content, setContent] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('review')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string; type: string } | null>(null)

  const handleCancelDelete = async () => {
    const message = content?.status === 'GENERATING'
      ? 'Cancel generation and delete this content item? This cannot be undone.'
      : 'Delete this content item? This cannot be undone.'
    if (!confirm(message)) {
      return
    }
    setCancelling(true)
    try {
      const response = await fetch(`/api/content/${id}`, { method: 'DELETE' })
      if (response.ok) {
        router.push('/admin/content')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setCancelling(false)
    }
  }

  const loadContent = useCallback(async () => {
    try {
      const response = await fetch(`/api/content/${id}`)
      if (response.ok) {
        const data = await response.json()
        setContent(data)
      }
    } catch (error) {
      console.error('Failed to load content:', error)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  // Auto-refresh when content is generating
  useEffect(() => {
    if (content?.status !== 'GENERATING') return

    const interval = setInterval(() => {
      loadContent()
    }, 3000) // Refresh every 3 seconds

    return () => clearInterval(interval)
  }, [content?.status, loadContent])

  // Close lightbox on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function updateApproval(field: string, value: string) {
    if (!content) return
    setSaving(true)
    try {
      const response = await fetch(`/api/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (response.ok) {
        const data = await response.json()
        setContent(data)
      }
    } catch (error) {
      console.error('Failed to update:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Content not found</p>
      </div>
    )
  }

  const approvedCount = [
    content.blogApproved === 'APPROVED',
    content.imagesApproved === 'APPROVED',
    content.socialApproved === 'APPROVED',
    content.wrhqBlogApproved === 'APPROVED',
    content.wrhqSocialApproved === 'APPROVED',
  ].filter(Boolean).length

  const totalRequired = 5

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/admin/content" className="text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Content Review</h1>
            <p className="text-sm text-gray-500">{content.client.businessName}</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {content.status === 'GENERATING' ? (
              <>
                <div className="flex items-center gap-2 text-blue-600">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Generating content...</span>
                </div>
                <button
                  onClick={handleCancelDelete}
                  disabled={cancelling}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              </>
            ) : content.status === 'FAILED' ? (
              <>
                <div className="text-sm text-red-600">Generation failed</div>
                <button
                  onClick={handleCancelDelete}
                  disabled={cancelling}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Delete
                </button>
              </>
            ) : content.status !== 'PUBLISHED' ? (
              <>
                <div className="text-sm text-gray-500">
                  {approvedCount} of {totalRequired} approved
                </div>
                <button
                  onClick={handleCancelDelete}
                  disabled={cancelling}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  title="Delete this content"
                >
                  <XCircle className="h-4 w-4" />
                  {cancelling ? 'Deleting...' : 'Trash'}
                </button>
              </>
            ) : (
              <div className="text-sm text-green-600">Published</div>
            )}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              content.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
              content.status === 'REVIEW' ? 'bg-yellow-100 text-yellow-700' :
              content.status === 'GENERATING' ? 'bg-blue-100 text-blue-700 animate-pulse' :
              content.status === 'FAILED' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {content.status}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('review')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
              activeTab === 'review'
                ? 'bg-white border-t border-l border-r text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Review Content
          </button>
          <button
            onClick={() => setActiveTab('published')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
              activeTab === 'published'
                ? 'bg-white border-t border-l border-r text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            disabled={!content.clientBlogPublished}
          >
            <ExternalLink className="h-4 w-4 inline mr-2" />
            Published
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {content.status === 'FAILED' && content.lastError && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-medium text-red-800 mb-2">Generation Error Details:</h3>
          <pre className="text-xs text-red-700 whitespace-pre-wrap overflow-x-auto bg-red-100 p-3 rounded">
            {content.lastError}
          </pre>
        </div>
      )}

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'review' && (
          <ReviewTab content={content} onImageClick={setLightboxImage} onUpdate={loadContent} />
        )}
        {activeTab === 'published' && (
          <PublishedTab content={content} onUpdate={loadContent} />
        )}
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-6xl max-h-[90vh] w-full">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-xl font-bold"
            >
              Close (ESC)
            </button>
            <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.alt}
                className="w-full h-auto max-h-[80vh] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="p-4 bg-gray-50 border-t">
                <p className="font-medium text-gray-800">{lightboxImage.type}</p>
                <p className="text-sm text-gray-500">{lightboxImage.alt}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// TAB 1: REVIEW CONTENT - STEP-BY-STEP WORKFLOW
// ============================================

function ReviewTab({
  content,
  onImageClick,
  onUpdate,
}: {
  content: ContentItem
  onImageClick: (image: { url: string; alt: string; type: string }) => void
  onUpdate: () => void
}) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [republishing, setRepublishing] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Collapsed state for sections - auto-collapse completed sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  // Initialize collapsed state based on completion
  useEffect(() => {
    setCollapsedSections({
      step1: content.clientBlogPublished,
      step2: content.wrhqBlogPublished,
      step3: content.socialPosts.length > 0 && content.socialPosts.every(p => p.status === 'SCHEDULED' || p.status === 'PUBLISHED'),
      step4: content.podcastAddedToPost,
      step5: content.videoSocialPosts.length > 0 && content.videoSocialPosts.every(p => p.status === 'SCHEDULED' || p.status === 'PUBLISHED'),
      step6: content.longVideoUploaded,
      step7: !!content.mediaEmbeddedAt,
    })
  }, []) // Only run once on mount

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Poll for podcast status when processing
  useEffect(() => {
    if (content.podcast?.status !== 'PROCESSING') return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/content/${content.id}/podcast-status`)
        const data = await response.json()

        if (data.status === 'ready' || data.status === 'failed') {
          clearInterval(interval)
          onUpdate()
        }
      } catch (err) {
        console.error('Error polling podcast status:', err)
      }
    }, 10000) // Poll every 10 seconds

    return () => clearInterval(interval)
  }, [content.id, content.podcast?.status, onUpdate])

  // Poll for social post status when any post is PROCESSING
  useEffect(() => {
    const hasProcessingPosts = content.socialPosts.some(p => p.status === 'PROCESSING') ||
                               content.wrhqSocialPosts.some(p => p.status === 'PROCESSING')

    if (!hasProcessingPosts) return

    const interval = setInterval(async () => {
      try {
        // Call the social-status endpoint to check Late API for updates
        const response = await fetch(`/api/content/${content.id}/social-status`)
        const data = await response.json()

        // If any posts were updated or failed, refresh the content
        if (data.updated > 0 || data.failed > 0 || data.stillProcessing === 0) {
          onUpdate()
        }
      } catch (err) {
        console.error('Error polling social post status:', err)
      }
    }, 5000) // Poll every 5 seconds for social posts

    return () => clearInterval(interval)
  }, [content.id, content.socialPosts, content.wrhqSocialPosts, onUpdate])

  // Poll for short video status when processing
  useEffect(() => {
    if (content.shortVideo?.status !== 'PROCESSING') return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/content/${content.id}/video-status`)
        const data = await response.json()

        if (data.status === 'ready' || data.status === 'failed') {
          clearInterval(interval)
          onUpdate()
        }
      } catch (err) {
        console.error('Error polling video status:', err)
      }
    }, 10000) // Poll every 10 seconds

    return () => clearInterval(interval)
  }, [content.id, content.shortVideo?.status, onUpdate])

  // Step status helpers
  const isStep1Complete = content.clientBlogPublished
  const isStep2Complete = content.wrhqBlogPublished
  const isStep3Complete = content.socialPosts.length > 0 && content.socialPosts.every(p => p.status === 'SCHEDULED' || p.status === 'PUBLISHED')
  const isStep4Complete = content.podcastAddedToPost
  const isStep5Complete = content.videoSocialPosts.length > 0 && content.videoSocialPosts.every(p => p.status === 'SCHEDULED' || p.status === 'PUBLISHED')
  const isStep6Complete = content.longVideoUploaded
  const isStep7Complete = !!content.mediaEmbeddedAt

  async function regenerateContent(type: 'blog' | 'images' | 'wrhqBlog' | 'social' | 'wrhqSocial' | 'podcast' | 'podcastDescription' | 'video' | 'videoDescription' | 'videoSocial') {
    setGenerating(type)
    setError(null)
    try {
      const flags: Record<string, boolean> = {
        generateBlog: type === 'blog',
        generateImages: type === 'images',
        generatePodcast: type === 'podcast',
        regenPodcastDescription: type === 'podcastDescription',
        generateSocial: type === 'social',
        generateWrhqBlog: type === 'wrhqBlog',
        generateWrhqSocial: type === 'wrhqSocial',
        generateShortVideo: type === 'video',
        regenVideoDescription: type === 'videoDescription',
        generateVideoSocial: type === 'videoSocial',
      }

      const response = await fetch(`/api/content/${content.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      // Check for errors in the results even on 200 OK
      if (data.results) {
        const failedResults = Object.entries(data.results as Record<string, { success: boolean; error?: string }>)
          .filter(([, result]) => !result.success && result.error)
          .map(([key, result]) => `${key}: ${result.error}`)

        if (failedResults.length > 0) {
          throw new Error(failedResults.join('; '))
        }
      }

      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setGenerating(null)
    }
  }

  async function publishContent(type: 'clientBlog' | 'wrhqBlog' | 'social' | 'wrhqSocial' | 'podcast' | 'videoSocial' | 'wrhqVideoSocial', postImmediate = true) {
    setPublishing(type)
    setError(null)
    try {
      const flags: Record<string, boolean> = {
        publishClientBlog: type === 'clientBlog',
        publishWrhqBlog: type === 'wrhqBlog',
        scheduleSocial: type === 'social',
        scheduleWrhqSocial: type === 'wrhqSocial',
        scheduleVideoSocial: type === 'videoSocial',
        scheduleWrhqVideoSocial: type === 'wrhqVideoSocial',
        postImmediate, // Post now instead of scheduling
      }

      // For podcast, use a separate endpoint
      if (type === 'podcast') {
        const response = await fetch(`/api/content/${content.id}/publish-podcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Podcast publishing failed')
        }
      } else {
        const response = await fetch(`/api/content/${content.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flags),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Publishing failed')
        }

        // Check for errors in the results even on 200 OK
        if (data.results) {
          const failedResults = Object.entries(data.results as Record<string, { success: boolean; error?: string }>)
            .filter(([, result]) => !result.success && result.error)
            .map(([key, result]) => `${key}: ${result.error}`)

          if (failedResults.length > 0) {
            throw new Error(failedResults.join('; '))
          }
        }
      }

      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setPublishing(null)
    }
  }

  async function refreshStatus() {
    setRefreshing(true)
    setError(null)
    try {
      const response = await fetch(`/api/content/${content.id}/refresh-status`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh status')
      }

      // Refresh the page data
      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setRefreshing(false)
    }
  }

  async function republishBlog() {
    setRepublishing(true)
    setError(null)
    try {
      const response = await fetch(`/api/content/${content.id}/republish-blog`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to re-publish blog')
      }

      // Refresh the page data
      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setRepublishing(false)
    }
  }

  async function embedAllMedia() {
    setEmbedding(true)
    setError(null)
    try {
      const response = await fetch(`/api/content/${content.id}/embed-all-media`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to embed media')
      }

      // Refresh the page data
      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setEmbedding(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Error:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Summary Header - Progress Overview */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Progress Overview</h3>
          <span className="text-sm text-gray-500">
            {[isStep1Complete, isStep2Complete, isStep3Complete, isStep4Complete, isStep5Complete, isStep6Complete, isStep7Complete].filter(Boolean).length} of 7 complete
          </span>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {/* Step 1: Client Blog */}
          <button
            onClick={() => toggleSection('step1')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep1Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <FileText className={`h-5 w-5 mx-auto mb-1 ${isStep1Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Client Blog</p>
            {isStep1Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>

          {/* Step 2: WRHQ Blog */}
          <button
            onClick={() => toggleSection('step2')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep2Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Building2 className={`h-5 w-5 mx-auto mb-1 ${isStep2Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">WRHQ Blog</p>
            {isStep2Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>

          {/* Step 3: Social Posts */}
          <button
            onClick={() => toggleSection('step3')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep3Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Share2 className={`h-5 w-5 mx-auto mb-1 ${isStep3Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Social Posts</p>
            {isStep3Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>

          {/* Step 4: Podcast */}
          <button
            onClick={() => toggleSection('step4')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep4Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Mic className={`h-5 w-5 mx-auto mb-1 ${isStep4Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Podcast</p>
            {isStep4Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>

          {/* Step 5: Short Video */}
          <button
            onClick={() => toggleSection('step5')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep5Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Video className={`h-5 w-5 mx-auto mb-1 ${isStep5Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Short Video</p>
            {isStep5Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>

          {/* Step 6: Long Video */}
          <button
            onClick={() => toggleSection('step6')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep6Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Play className={`h-5 w-5 mx-auto mb-1 ${isStep6Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Long Video</p>
            {isStep6Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Optional</span>
            )}
          </button>

          {/* Step 7: Embed Media */}
          <button
            onClick={() => toggleSection('step7')}
            className={`p-3 rounded-lg text-center transition-colors ${
              isStep7Complete
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Layers className={`h-5 w-5 mx-auto mb-1 ${isStep7Complete ? 'text-green-600' : 'text-gray-400'}`} />
            <p className="text-xs font-medium truncate">Embed Media</p>
            {isStep7Complete ? (
              <Check className="h-3 w-3 mx-auto mt-1 text-green-600" />
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
          </button>
        </div>
      </div>

      {/* PAA Question */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-600 font-medium">PAA Question</p>
        <p className="text-lg text-blue-900">
          {(() => {
            const city = content.serviceLocation?.city || content.client.city
            const state = (content.serviceLocation?.state || content.client.state).toUpperCase()
            return content.paaQuestion.replace(/\{location\}/gi, `${city}, ${state}`)
          })()}
        </p>
      </div>

      {/* ============================================ */}
      {/* STEP 1: Client Blog - Review & Publish */}
      {/* ============================================ */}
      <section className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep1Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step1')}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep1Complete ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
              {isStep1Complete ? <Check className="h-5 w-5" /> : '1'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Client Blog Post</h2>
              <p className="text-sm text-gray-500">Review blog and images, then publish to WordPress</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStep1Complete ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="text-sm font-medium">Published</span>
                  {content.clientBlogUrl && (
                    <a href={content.clientBlogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); republishBlog(); }}
                  disabled={republishing}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                  title="Re-publish blog with all embeds (image, map, podcast, video)"
                >
                  {republishing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Re-publishing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Re-publish
                    </>
                  )}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); regenerateContent('blog'); }}
                  disabled={generating === 'blog'}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'blog' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {content.blogGenerated ? 'Regenerate Blog' : 'Generate Blog'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); regenerateContent('images'); }}
                  disabled={generating === 'images'}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'images' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {content.imagesGenerated ? 'Regenerate Images' : 'Generate Images'}
                </button>
                {content.blogGenerated && content.imagesGenerated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publishContent('clientBlog'); }}
                    disabled={publishing === 'clientBlog'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'clientBlog' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Publish
                      </>
                    )}
                  </button>
                )}
              </>
            )}
            {collapsedSections.step1 ? (
              <ChevronDown className="h-5 w-5 text-gray-400 ml-2" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400 ml-2" />
            )}
          </div>
        </div>

        {!collapsedSections.step1 && (
        <div className="p-6 space-y-6">
          {/* Blog Post */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold">Blog Content</h3>
              {content.blogGenerated && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Generated</span>
              )}
            </div>

            {content.blogPost ? (
              <div>
                <h4 className="text-xl font-bold mb-2">{content.blogPost.title}</h4>
                {content.blogPost.excerpt && (
                  <p className="text-gray-600 mb-4 italic">{content.blogPost.excerpt}</p>
                )}
                <div className="flex gap-4 text-sm text-gray-500 mb-4">
                  <span>{content.blogPost.wordCount} words</span>
                  {content.blogPost.metaDescription && (
                    <span>Meta: {content.blogPost.metaDescription.length} chars</span>
                  )}
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700 mb-2">
                    Show full content
                  </summary>
                  <div
                    className="prose max-w-none border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: content.blogPost.content }}
                  />
                </details>
              </div>
            ) : (
              <p className="text-gray-500">Blog post not yet generated</p>
            )}
          </div>

          {/* Images */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold">Images</h3>
              <span className="text-sm text-gray-500">({content.images.length} generated)</span>
            </div>

            {content.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {content.images.map((image) => (
                  <div
                    key={image.id}
                    className="border rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => onImageClick({
                      url: image.gcsUrl,
                      alt: image.altText || image.imageType,
                      type: image.imageType.replace(/_/g, ' ')
                    })}
                  >
                    <img
                      src={image.gcsUrl}
                      alt={image.altText || image.imageType}
                      className="w-full h-40 object-cover"
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-600">{image.imageType.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-400">{image.width}x{image.height}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No images generated yet</p>
            )}
          </div>
        </div>
        )}
      </section>

      {/* ============================================ */}
      {/* STEP 2: WRHQ Blog - Generate & Publish */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep2Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step2')}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep2Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep2Complete ? <Check className="h-5 w-5" /> : '2'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">WRHQ Blog Post</h2>
              <p className="text-sm text-gray-500">Generate and publish WRHQ partner article</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStep2Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published</span>
                {content.wrhqBlogUrl && (
                  <a href={content.wrhqBlogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); regenerateContent('wrhqBlog'); }}
                  disabled={generating === 'wrhqBlog' || !isStep1Complete}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'wrhqBlog' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {content.wrhqBlogGenerated ? 'Regenerate' : 'Generate'}
                </button>
                {content.wrhqBlogGenerated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publishContent('wrhqBlog'); }}
                    disabled={publishing === 'wrhqBlog'}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'wrhqBlog' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Publish
                      </>
                    )}
                  </button>
                )}
              </>
            )}
            {collapsedSections.step2 ? (
              <ChevronDown className="h-5 w-5 text-gray-400 ml-2" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400 ml-2" />
            )}
          </div>
        </div>

        {!collapsedSections.step2 && content.wrhqBlogPost && (
          <div className="p-6">
            <h4 className="text-lg font-semibold mb-2">{content.wrhqBlogPost.title}</h4>
            <p className="text-sm text-gray-500 mb-4">{content.wrhqBlogPost.wordCount} words | Slug: {content.wrhqBlogPost.slug}</p>
            <details className="group">
              <summary className="cursor-pointer text-sm text-purple-600 hover:text-purple-700 mb-2">
                Show full content
              </summary>
              <div
                className="prose prose-sm max-w-none bg-purple-50 rounded-lg p-4 max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: content.wrhqBlogPost.content }}
              />
            </details>
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* STEP 3: Social Media - Generate & Publish */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep3Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step3')}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep3Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep3Complete ? <Check className="h-5 w-5" /> : '3'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Social Media Posts</h2>
              <p className="text-sm text-gray-500">Generate and schedule social media content</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStep3Complete && (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published</span>
              </div>
            )}
            {collapsedSections.step3 ? (
              <ChevronDown className="h-5 w-5 text-gray-400 ml-2" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400 ml-2" />
            )}
          </div>
        </div>

        {!collapsedSections.step3 && (
        <div className="p-6 space-y-6">
          {/* Client Social Posts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold">Client Social Posts</h3>
                <span className="text-sm text-gray-500">({content.socialPosts.length} posts)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => regenerateContent('social')}
                  disabled={generating === 'social' || !isStep1Complete}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'social' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {content.socialGenerated ? 'Regenerate' : 'Generate'}
                </button>
                {content.socialGenerated && (
                  <button
                    onClick={() => publishContent('social')}
                    disabled={publishing === 'social' || content.socialPosts.length === 0 || content.socialPosts.every(p => p.status === 'PUBLISHED') || content.socialPosts.some(p => p.status === 'PROCESSING')}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'social' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : content.socialPosts.some(p => p.status === 'PROCESSING') ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : content.socialPosts.length > 0 && content.socialPosts.every(p => p.status === 'PUBLISHED') ? (
                      <>
                        <Check className="h-4 w-4" />
                        Published
                      </>
                    ) : (
                      'Publish'
                    )}
                  </button>
                )}
              </div>
            </div>

            {content.socialPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {content.socialPosts.map((post) => (
                  <SocialPostPreview key={post.id} post={post} images={content.images} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Click "Generate" to create social content</p>
            )}
          </div>

          {/* WRHQ Social Posts */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-400" />
                <h3 className="font-semibold">WRHQ Social Posts</h3>
                <span className="text-sm text-gray-500">({content.wrhqSocialPosts.length} posts)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => regenerateContent('wrhqSocial')}
                  disabled={generating === 'wrhqSocial' || !isStep1Complete}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'wrhqSocial' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {content.wrhqSocialGenerated ? 'Regenerate' : 'Generate'}
                </button>
                {content.wrhqSocialGenerated && (
                  <button
                    onClick={() => publishContent('wrhqSocial')}
                    disabled={publishing === 'wrhqSocial' || content.wrhqSocialPosts.length === 0 || content.wrhqSocialPosts.every(p => p.status === 'PUBLISHED') || content.wrhqSocialPosts.some(p => p.status === 'PROCESSING')}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'wrhqSocial' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : content.wrhqSocialPosts.some(p => p.status === 'PROCESSING') ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : content.wrhqSocialPosts.length > 0 && content.wrhqSocialPosts.every(p => p.status === 'PUBLISHED') ? (
                      <>
                        <Check className="h-4 w-4" />
                        Published
                      </>
                    ) : (
                      'Publish'
                    )}
                  </button>
                )}
              </div>
            </div>

            {content.wrhqSocialPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {content.wrhqSocialPosts.map((post) => (
                  <SocialPostPreview key={post.id} post={post} isWRHQ images={content.images} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Click "Generate" to create WRHQ social content</p>
            )}
          </div>
        </div>
        )}
      </section>

      {/* ============================================ */}
      {/* STEP 4: Podcast - Generate, Publish & Embed */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep4Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step4')}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep4Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep4Complete ? <Check className="h-5 w-5" /> : '4'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Podcast</h2>
              <p className="text-sm text-gray-500">Generate audio, publish to Podbean, embed in blog</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.podcast?.status === 'PROCESSING' ? (
              <div className="flex items-center gap-2 text-orange-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating audio (2-5 min)...</span>
              </div>
            ) : isStep4Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published & Embedded</span>
              </div>
            ) : content.podcast?.status === 'PUBLISHED' ? (
              <div className="flex items-center gap-2 text-blue-600">
                <Check className="h-4 w-4" />
                <span className="text-sm">Published to Podbean</span>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); regenerateContent('podcast'); }}
                  disabled={generating === 'podcast' || !isStep1Complete}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'podcast' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  {content.podcastGenerated ? 'Regenerate' : 'Generate'}
                </button>
                {content.podcast?.status === 'READY' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publishContent('podcast'); }}
                    disabled={publishing === 'podcast'}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'podcast' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Publish
                      </>
                    )}
                  </button>
                )}
              </>
            )}
            {collapsedSections.step4 ? (
              <ChevronDown className="h-5 w-5 text-gray-400 ml-2" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400 ml-2" />
            )}
          </div>
        </div>

        {/* Show content when processing, ready, failed, or has description */}
        {!collapsedSections.step4 && (content.podcast?.status === 'PROCESSING' || content.podcast?.status === 'READY' || content.podcast?.status === 'FAILED' || content.podcastDescription) && (
          <div className="p-6 space-y-4">
            {/* Processing status indicator */}
            {content.podcast?.status === 'PROCESSING' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <RefreshCw className="h-5 w-5 animate-spin text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-orange-800">Generating podcast audio...</p>
                    <p className="text-xs text-orange-600 mt-1">This typically takes 2-5 minutes. The page will update automatically when ready.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Failed status */}
            {content.podcast?.status === 'FAILED' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Podcast generation failed</p>
                    <p className="text-xs text-red-600 mt-1">Please try regenerating the podcast.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Audio player when ready */}
            {content.podcast?.audioUrl && content.podcast?.status === 'READY' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Audio Preview</label>
                <audio controls className="w-full" src={content.podcast.audioUrl} />
                {content.podcast.duration && (
                  <p className="text-sm text-gray-500 mt-1">
                    Duration: {Math.floor(content.podcast.duration / 60)}:{String(Math.round(content.podcast.duration) % 60).padStart(2, '0')}
                  </p>
                )}
              </div>
            )}

            {/* Description - show even during processing since it's generated immediately */}
            {(content.podcastDescription || content.podcast?.description) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Podcast Description</label>
                  <button
                    onClick={() => regenerateContent('podcastDescription')}
                    disabled={generating === 'podcastDescription'}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generating === 'podcastDescription' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate Description
                  </button>
                </div>
                <div
                  className="border rounded-lg p-4 bg-orange-50 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: content.podcastDescription || content.podcast?.description || ''
                  }}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* STEP 5: Short Video - Generate & Publish to Video Platforms */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep5Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step5')}
        >
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isStep5Complete ? 'bg-green-500 text-white' : 'bg-purple-100 text-purple-700'}`}>
              {isStep5Complete ? <Check className="h-5 w-5" /> : '5'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Short Video</h2>
              <p className="text-sm text-gray-500">Generate 9:16 video for TikTok, YouTube Shorts, Instagram Reels</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.shortVideo?.status === 'PROCESSING' ? (
              <div className="flex items-center gap-2 text-purple-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating video (3-8 min)...</span>
              </div>
            ) : content.shortVideo?.status === 'FAILED' ? (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">Generation failed</span>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); regenerateContent('video'); }}
                  disabled={generating === 'video' || !isStep1Complete}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating === 'video' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {content.shortVideoGenerated ? 'Regenerate' : 'Generate'}
                </button>
                {content.shortVideo?.status === 'READY' && content.videoSocialPosts.length === 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); regenerateContent('videoSocial'); }}
                    disabled={generating === 'videoSocial'}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating === 'videoSocial' ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                    Generate Posts
                  </button>
                )}
                {content.videoSocialPosts.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publishContent('videoSocial'); }}
                    disabled={publishing === 'videoSocial' || content.videoSocialPosts.every(p => p.status === 'PUBLISHED' || p.status === 'PROCESSING')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'videoSocial' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4" />
                        Publish
                      </>
                    )}
                  </button>
                )}
                {content.wrhqVideoSocialPosts.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publishContent('wrhqVideoSocial'); }}
                    disabled={publishing === 'wrhqVideoSocial' || content.wrhqVideoSocialPosts.every(p => p.status === 'PUBLISHED' || p.status === 'PROCESSING')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {publishing === 'wrhqVideoSocial' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4" />
                        Publish WRHQ
                      </>
                    )}
                  </button>
                )}
                {/* Refresh Status button - show when any video posts are PROCESSING */}
                {(content.videoSocialPosts.some(p => p.status === 'PROCESSING') ||
                  content.wrhqVideoSocialPosts.some(p => p.status === 'PROCESSING')) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); refreshStatus(); }}
                    disabled={refreshing}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing...' : 'Refresh Status'}
                  </button>
                )}
              </>
            )}
            {collapsedSections.step5 ? (
              <ChevronDown className="h-5 w-5 text-gray-400 ml-2" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400 ml-2" />
            )}
          </div>
        </div>

        {/* Show content when processing, ready, failed, or has video */}
        {!collapsedSections.step5 && (content.shortVideo?.status === 'PROCESSING' || content.shortVideo?.status === 'READY' || content.shortVideo?.status === 'FAILED' || content.shortVideoDescription) && (
          <div className="p-6 space-y-4">
            {/* Processing status indicator */}
            {content.shortVideo?.status === 'PROCESSING' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <RefreshCw className="h-5 w-5 animate-spin text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-purple-800">Generating short video...</p>
                    <p className="text-xs text-purple-600 mt-1">This typically takes 3-8 minutes. The page will update automatically when ready.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Failed status */}
            {content.shortVideo?.status === 'FAILED' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Video generation failed</p>
                    <p className="text-xs text-red-600 mt-1">Please try regenerating the video.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Video player when ready */}
            {content.shortVideo?.videoUrl && content.shortVideo?.status === 'READY' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Video Preview</label>
                <div className="relative max-w-xs mx-auto">
                  <video
                    controls
                    className="w-full rounded-lg shadow-lg"
                    src={content.shortVideo.videoUrl}
                    poster={content.shortVideo.thumbnailUrl || undefined}
                  />
                </div>
                {content.shortVideo.duration && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    Duration: {Math.floor(content.shortVideo.duration / 60)}:{String(Math.round(content.shortVideo.duration) % 60).padStart(2, '0')}
                  </p>
                )}
              </div>
            )}

            {/* Description - show even during processing since it's generated immediately */}
            {content.shortVideoDescription && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Video Description</label>
                  <button
                    onClick={() => regenerateContent('videoDescription')}
                    disabled={generating === 'videoDescription'}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generating === 'videoDescription' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate Description
                  </button>
                </div>
                <div
                  className="border rounded-lg p-4 bg-purple-50 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: content.shortVideoDescription
                  }}
                />
              </div>
            )}

            {/* Video Social Posts Preview */}
            {content.videoSocialPosts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Video Social Posts</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {content.videoSocialPosts.map((post) => (
                    <div key={post.id} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-2 font-medium">
                          {PLATFORM_ICONS[post.platform] || '📱'} {post.platform}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                          post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                          post.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          post.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{post.caption}</p>
                      {post.publishedUrl && (
                        <a
                          href={post.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View Post
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WRHQ Video Social Posts Preview */}
            {content.wrhqVideoSocialPosts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">WRHQ Video Social Posts</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {content.wrhqVideoSocialPosts.map((post) => (
                    <div key={post.id} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-2 font-medium">
                          {PLATFORM_ICONS[post.platform] || '📱'} {post.platform}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                          post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                          post.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          post.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{post.caption}</p>
                      {post.publishedUrl && (
                        <a
                          href={post.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View Post
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* STEP 6: Long-form Video - Upload to WRHQ YouTube */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div className={`px-6 py-4 flex items-center justify-between ${content.longVideoUploaded ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${content.longVideoUploaded ? 'bg-green-500 text-white' : 'bg-red-100 text-red-700'}`}>
              {content.longVideoUploaded ? <Check className="h-5 w-5" /> : '6'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Long-form Video (Optional)</h2>
              <p className="text-sm text-gray-500">Upload 16:9 video to WRHQ YouTube channel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.longVideoUploaded ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                <span className="text-sm">Uploaded to YouTube</span>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Optional - Upload video below</span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {content.longVideoUploaded && content.longformVideoUrl ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Video uploaded to YouTube</span>
                </div>
                <a
                  href={content.longformVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  {content.longformVideoUrl}
                </a>
              </div>
              {content.mediaEmbeddedAt && content.longVideoAddedToPost && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Embedded in blog post
                </div>
              )}

              {/* Option to upload a different video */}
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" />
                  Upload a different video
                </summary>
                <div className="mt-4 pt-4 border-t">
                  <LongformVideoUpload
                    contentId={content.id}
                    paaQuestion={content.paaQuestion}
                    clientBlogUrl={content.clientBlogUrl}
                    wrhqBlogUrl={content.wrhqBlogUrl}
                    client={content.client}
                    serviceLocation={content.serviceLocation}
                    podcastUrl={content.podcast?.podbeanUrl}
                    onSuccess={onUpdate}
                  />
                </div>
              </details>
            </div>
          ) : (
            <LongformVideoUpload
              contentId={content.id}
              paaQuestion={content.paaQuestion}
              clientBlogUrl={content.clientBlogUrl}
              wrhqBlogUrl={content.wrhqBlogUrl}
              client={content.client}
              serviceLocation={content.serviceLocation}
              podcastUrl={content.podcast?.podbeanUrl}
              onSuccess={onUpdate}
            />
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* STEP 7: Embed All Media - Add embeds to blog */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div
          className={`px-6 py-4 flex items-center justify-between cursor-pointer ${isStep7Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}
          onClick={() => toggleSection('step7')}
        >
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isStep7Complete ? 'bg-green-500 text-white' : 'bg-blue-100 text-blue-700'}`}>
              {isStep7Complete ? <Check className="h-5 w-5" /> : '7'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Embed All Media</h2>
              <p className="text-sm text-gray-500">Add videos and podcast to blog</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStep7Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                <span className="text-sm">
                  Embedded {content.mediaEmbeddedAt ? new Date(content.mediaEmbeddedAt).toLocaleDateString() : ''}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Ready to embed</span>
            )}
            {collapsedSections.step7 ? (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>

        {!collapsedSections.step7 && (
          <div className="p-6 space-y-4">
            {!isStep1Complete ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800">Publish the client blog first before embedding media.</p>
              </div>
            ) : isStep7Complete ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800">All media embedded in blog</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Videos and podcast have been added to the WordPress post.
                  </p>
                </div>

                {/* Option to re-embed */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    embedAllMedia()
                  }}
                  disabled={embedding}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${embedding ? 'animate-spin' : ''}`} />
                  {embedding ? 'Re-embedding...' : 'Re-embed All Media'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">This will embed the following into the blog:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {content.videoSocialPosts.some(p => p.platform === 'YOUTUBE' && p.publishedUrl) && (
                      <li className="flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        YouTube Short video (floated right)
                      </li>
                    )}
                    {content.longformVideoUrl && (
                      <li className="flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        Long-form video (before Google Maps)
                      </li>
                    )}
                    {content.podcast?.podbeanPlayerUrl && (
                      <li className="flex items-center gap-2">
                        <Mic className="h-4 w-4" />
                        Podcast player embed (at end)
                      </li>
                    )}
                  </ul>
                  <p className="text-xs text-blue-600 mt-2">
                    Note: Featured image and Google Maps are already in the published blog.
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    embedAllMedia()
                  }}
                  disabled={embedding}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Layers className={`h-5 w-5 ${embedding ? 'animate-pulse' : ''}`} />
                  {embedding ? 'Embedding Media...' : 'Embed All Media'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ============================================
// LONG-FORM VIDEO UPLOAD COMPONENT
// ============================================

interface LongformVideoUploadProps {
  contentId: string
  paaQuestion: string
  clientBlogUrl: string | null
  wrhqBlogUrl: string | null
  client: {
    id: string
    businessName: string
    slug: string
    city: string
    state: string
  }
  serviceLocation: {
    id: string
    city: string
    state: string
  } | null
  podcastUrl?: string | null
  onSuccess: () => void
}

function LongformVideoUpload({
  contentId,
  paaQuestion,
  clientBlogUrl,
  wrhqBlogUrl,
  client,
  serviceLocation,
  podcastUrl,
  onSuccess,
}: LongformVideoUploadProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [youtubeConfigured, setYoutubeConfigured] = useState<boolean | null>(null)

  const location = serviceLocation
    ? `${serviceLocation.city}, ${serviceLocation.state}`
    : `${client.city}, ${client.state}`

  // Replace {location} placeholder in PAA question for display
  const displayQuestion = paaQuestion.replace(/{location}/gi, location)

  // Check if YouTube is configured
  useEffect(() => {
    fetch('/api/settings/wrhq/youtube/playlists')
      .then((res) => res.json())
      .then((data) => {
        setYoutubeConfigured(data.connected)
      })
      .catch(() => {
        setYoutubeConfigured(false)
      })
  }, [])

  async function handleUpload() {
    if (!videoFile) return

    setUploading(true)
    setError(null)
    setUploadProgress(0)

    const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB chunks (under Vercel's 4.5MB limit)

    try {
      // Step 1: Initialize YouTube upload session
      setUploadProgress(2)
      const initResponse = await fetch(`/api/content/${contentId}/init-youtube-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileSize: videoFile.size,
        }),
      })

      if (!initResponse.ok) {
        const data = await initResponse.json()
        throw new Error(data.error || 'Failed to initialize upload')
      }

      const { sessionId } = await initResponse.json()
      console.log('Upload session initialized:', sessionId)

      // Step 2: Upload in chunks
      const totalChunks = Math.ceil(videoFile.size / CHUNK_SIZE)
      let uploadedBytes = 0
      let uploadComplete = false
      let finalResult: { videoId: string; videoUrl: string; playlistId?: string; thumbnailUrl?: string; description?: string } | null = null

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, videoFile.size) - 1
        const chunk = videoFile.slice(start, end + 1)

        // Update progress (5-85% for chunks)
        const chunkProgress = 5 + Math.round((chunkIndex / totalChunks) * 80)
        setUploadProgress(chunkProgress)

        console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks}: bytes ${start}-${end}/${videoFile.size}`)

        const chunkResponse = await fetch(`/api/content/${contentId}/upload-chunk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'video/*',
            'Content-Range': `bytes ${start}-${end}/${videoFile.size}`,
            'Content-Length': chunk.size.toString(),
          },
          body: chunk,
        })

        if (!chunkResponse.ok) {
          const data = await chunkResponse.json()
          throw new Error(data.error || `Chunk ${chunkIndex + 1} upload failed`)
        }

        const chunkResult = await chunkResponse.json()
        uploadedBytes = chunkResult.bytesUploaded || end + 1

        if (chunkResult.complete) {
          uploadComplete = true
          finalResult = chunkResult
          console.log('Upload complete:', chunkResult.videoId)
          break
        }
      }

      if (!uploadComplete || !finalResult) {
        throw new Error('Upload did not complete properly')
      }

      // Step 3: Finalize upload (add to playlist, set thumbnail, embed in blogs)
      setUploadProgress(90)
      const finalizeResponse = await fetch(`/api/content/${contentId}/finalize-youtube-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: finalResult.videoId,
          videoUrl: finalResult.videoUrl,
          playlistId: finalResult.playlistId,
          thumbnailUrl: finalResult.thumbnailUrl,
          description: finalResult.description,
        }),
      })

      if (!finalizeResponse.ok) {
        const data = await finalizeResponse.json()
        throw new Error(data.error || 'Failed to finalize upload')
      }

      setUploadProgress(100)
      onSuccess()
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (youtubeConfigured === null) {
    return <div className="text-sm text-gray-500">Checking YouTube configuration...</div>
  }

  if (!youtubeConfigured) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>YouTube API not configured.</strong> Configure YouTube API credentials in{' '}
        <a href="/admin/settings/wrhq" className="underline font-medium">
          Settings → WRHQ
        </a>{' '}
        to enable long-form video uploads.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Video title preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Video Title</label>
        <div className="border rounded-lg p-3 bg-gray-50 text-sm">
          {displayQuestion}
        </div>
      </div>

      {/* Description preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Video Description</label>
        <div className="border rounded-lg p-3 bg-gray-50 text-sm whitespace-pre-wrap">
          {displayQuestion}
{'\n'}
In this video, {client.businessName} answers your questions about windshield repair and replacement services in {location}.
{'\n'}
📚 RESOURCES:
{'\n'}
📝 Read the full article: {clientBlogUrl || '[Client blog URL]'}
🌐 WRHQ Directory: {wrhqBlogUrl || '[WRHQ blog URL]'}
{podcastUrl ? `🎧 Listen to the Podcast: ${podcastUrl}` : ''}
{'\n'}
---
{'\n'}
{client.businessName} provides professional windshield repair and auto glass replacement services in the {location} area.
        </div>
      </div>

      {/* File upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Video</label>
        <div className="border-2 border-dashed rounded-lg p-6 text-center">
          {videoFile ? (
            <div className="space-y-2">
              <Video className="h-8 w-8 text-gray-400 mx-auto" />
              <p className="text-sm font-medium">{videoFile.name}</p>
              <p className="text-xs text-gray-500">
                {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              <button
                onClick={() => setVideoFile(null)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Video className="h-8 w-8 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500">
                Drag and drop a video file, or click to select
              </p>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="hidden"
                id="longform-video-input"
              />
              <label
                htmlFor="longform-video-input"
                className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer"
              >
                Select Video
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Uploading to YouTube...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!videoFile || uploading}
        className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Video className="h-4 w-4" />
            Upload to YouTube
          </>
        )}
      </button>
    </div>
  )
}

// ============================================
// TAB 2: PUBLISHED
// ============================================

function PublishedTab({ content, onUpdate }: { content: ContentItem; onUpdate: () => void }) {
  if (!content.clientBlogPublished) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Content not yet published</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Client Blog */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Client Blog Post</h2>
        {content.clientBlogUrl ? (
          <a
            href={content.clientBlogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            {content.clientBlogUrl}
          </a>
        ) : (
          <p className="text-gray-500">URL not available</p>
        )}
      </section>

      {/* WRHQ Blog */}
      {content.wrhqBlogPublished && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">WRHQ Blog Post</h2>
          {content.wrhqBlogUrl ? (
            <a
              href={content.wrhqBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {content.wrhqBlogUrl}
            </a>
          ) : (
            <p className="text-gray-500">URL not available</p>
          )}
        </section>
      )}

      {/* Client Social Posts Status */}
      {content.socialPosts.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Client Social Posts</h2>
          <div className="space-y-2">
            {content.socialPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span>{PLATFORM_ICONS[post.platform] || '📱'}</span>
                  <span>{post.platform}</span>
                </div>
                <div className="flex items-center gap-3">
                  {post.publishedUrl && (
                    <a
                      href={post.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Post
                    </a>
                  )}
                  <span className={`px-2 py-1 rounded text-xs ${
                    post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                    post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {post.status === 'PUBLISHED' ? 'Published' : post.status === 'SCHEDULED' ? 'Scheduled' : post.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* WRHQ Social Posts Status */}
      {content.wrhqSocialPosts.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded">WRHQ</span>
            Social Posts
          </h2>
          <div className="space-y-2">
            {content.wrhqSocialPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span>{PLATFORM_ICONS[post.platform] || '📱'}</span>
                  <span>{post.platform}</span>
                </div>
                <div className="flex items-center gap-3">
                  {post.publishedUrl && (
                    <a
                      href={post.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Post
                    </a>
                  )}
                  <span className={`px-2 py-1 rounded text-xs ${
                    post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                    post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {post.status === 'PUBLISHED' ? 'Published' : post.status === 'SCHEDULED' ? 'Scheduled' : post.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Client Video Social Posts Status */}
      {content.videoSocialPosts.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Video className="h-5 w-5 text-purple-500" />
            Client Video Posts
          </h2>
          <div className="space-y-2">
            {content.videoSocialPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span>{PLATFORM_ICONS[post.platform] || '📱'}</span>
                  <span>{post.platform}</span>
                </div>
                <div className="flex items-center gap-3">
                  {post.publishedUrl && (
                    <a
                      href={post.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Post
                    </a>
                  )}
                  <span className={`px-2 py-1 rounded text-xs ${
                    post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                    post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                    post.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {post.status === 'PUBLISHED' ? 'Published' : post.status === 'SCHEDULED' ? 'Scheduled' : post.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* WRHQ Video Social Posts Status */}
      {content.wrhqVideoSocialPosts.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Video className="h-5 w-5 text-purple-500" />
            <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded">WRHQ</span>
            Video Posts
          </h2>
          <div className="space-y-2">
            {content.wrhqVideoSocialPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span>{PLATFORM_ICONS[post.platform] || '📱'}</span>
                  <span>{post.platform}</span>
                </div>
                <div className="flex items-center gap-3">
                  {post.publishedUrl && (
                    <a
                      href={post.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Post
                    </a>
                  )}
                  <span className={`px-2 py-1 rounded text-xs ${
                    post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                    post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                    post.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {post.status === 'PUBLISHED' ? 'Published' : post.status === 'SCHEDULED' ? 'Scheduled' : post.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Podcast */}
      {content.podcast?.status === 'PUBLISHED' && content.podcast.podbeanUrl && (
        <section className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Mic className="h-5 w-5 text-orange-500" />
            Podcast Episode
          </h2>
          <div className="space-y-3">
            <a
              href={content.podcast.podbeanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {content.podcast.podbeanUrl}
            </a>
            {content.podcast.duration && (
              <p className="text-sm text-gray-500">
                Duration: {Math.floor(content.podcast.duration / 60)}:{String(Math.round(content.podcast.duration) % 60).padStart(2, '0')}
              </p>
            )}
            {content.podcastAddedToPost ? (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Embedded in blog post
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Use &quot;Embed All Media&quot; on the Review tab to add to blog
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// ============================================
// HELPER COMPONENTS
// ============================================

function ApprovalCheckbox({
  approved,
  onChange,
  label,
  disabled,
}: {
  approved: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={approved}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
      />
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  )
}

// Platform-specific social post preview styled to look like actual platform cards
function SocialPostPreview({
  post,
  isWRHQ = false,
  images = [],
}: {
  post: { platform: string; caption: string; hashtags: string[]; approved: boolean; status: string; errorMessage?: string | null }
  isWRHQ?: boolean
  images?: Array<{ imageType: string; gcsUrl: string; altText: string | null }>
}) {
  const businessName = isWRHQ ? 'Windshield Repair HQ' : 'Your Business'

  // Find the appropriate image for this platform
  const platformImageMap: Record<string, string> = {
    FACEBOOK: 'FACEBOOK',
    INSTAGRAM: 'INSTAGRAM_FEED',
    LINKEDIN: 'LINKEDIN',
    TWITTER: 'TWITTER',
    GBP: 'BLOG_FEATURED', // GBP uses blog featured image
  }
  const imageType = platformImageMap[post.platform]
  const platformImage = images.find(img => img.imageType === imageType) || images.find(img => img.imageType === 'BLOG_FEATURED')

  // Facebook-style card
  if (post.platform === 'FACEBOOK') {
    return (
      <div className={`rounded-lg overflow-hidden border shadow-sm bg-white ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
        {/* Facebook Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {businessName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{businessName}</p>
              <p className="text-xs text-gray-500">Just now · 🌐</p>
            </div>
          </div>
          <StatusBadge status={post.status} errorMessage={post.errorMessage} />
        </div>
        {/* Content */}
        <div className="px-4 py-3">
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{post.caption}</p>
          {post.hashtags.length > 0 && (
            <p className="text-sm text-blue-600 mt-2">{post.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
        </div>
        {/* Image */}
        {platformImage ? (
          <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-[1200/630] object-cover" />
        ) : (
          <div className="w-full aspect-[1200/630] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-sm">Image will be attached</span>
          </div>
        )}
        {/* Facebook Actions */}
        <div className="px-4 py-2 border-t flex justify-around text-gray-500 text-sm">
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↗️ Share</span>
        </div>
        <CharacterCount caption={post.caption} platform={post.platform} />
      </div>
    )
  }

  // Instagram-style card
  if (post.platform === 'INSTAGRAM') {
    return (
      <div className={`rounded-lg overflow-hidden border shadow-sm bg-white ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
        {/* Instagram Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="text-xs font-bold bg-gradient-to-br from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  {businessName.charAt(0)}
                </span>
              </div>
            </div>
            <p className="font-semibold text-sm">{businessName.toLowerCase().replace(/\s+/g, '')}</p>
          </div>
          <StatusBadge status={post.status} errorMessage={post.errorMessage} />
        </div>
        {/* Image - square aspect ratio */}
        {platformImage ? (
          <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-square object-cover" />
        ) : (
          <div className="bg-gradient-to-br from-gray-100 to-gray-200 aspect-square flex items-center justify-center">
            <span className="text-gray-400 text-sm">Image will be attached</span>
          </div>
        )}
        {/* Instagram Actions */}
        <div className="px-4 py-2 flex gap-4 text-gray-800">
          <span>♡</span>
          <span>💬</span>
          <span>↗️</span>
        </div>
        {/* Caption */}
        <div className="px-4 pb-3">
          <p className="text-sm">
            <span className="font-semibold">{businessName.toLowerCase().replace(/\s+/g, '')} </span>
            {post.caption}
          </p>
          {post.hashtags.length > 0 && (
            <p className="text-sm text-blue-900 mt-1">{post.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
        </div>
        <CharacterCount caption={post.caption} platform={post.platform} />
      </div>
    )
  }

  // LinkedIn-style card
  if (post.platform === 'LINKEDIN') {
    return (
      <div className={`rounded-lg overflow-hidden border shadow-sm bg-white ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
        {/* LinkedIn Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-700 flex items-center justify-center text-white font-bold">
              {businessName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{businessName}</p>
              <p className="text-xs text-gray-500">Auto Glass Industry</p>
              <p className="text-xs text-gray-500">Just now · 🌐</p>
            </div>
          </div>
          <StatusBadge status={post.status} errorMessage={post.errorMessage} />
        </div>
        {/* Content */}
        <div className="px-4 py-3">
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{post.caption}</p>
          {post.hashtags.length > 0 && (
            <p className="text-sm text-sky-700 mt-2">{post.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
        </div>
        {/* Image */}
        {platformImage ? (
          <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-[1200/627] object-cover" />
        ) : (
          <div className="w-full aspect-[1200/627] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-sm">Image will be attached</span>
          </div>
        )}
        {/* LinkedIn Actions */}
        <div className="px-4 py-2 border-t flex justify-around text-gray-600 text-sm">
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>🔄 Repost</span>
          <span>📤 Send</span>
        </div>
        <CharacterCount caption={post.caption} platform={post.platform} />
      </div>
    )
  }

  // Twitter/X-style card
  if (post.platform === 'TWITTER') {
    return (
      <div className={`rounded-xl overflow-hidden border shadow-sm bg-white ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
        {/* X Header */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold">
            {businessName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">{businessName}</span>
              <span className="text-gray-500 text-sm">@{businessName.toLowerCase().replace(/\s+/g, '')}</span>
              <span className="text-gray-500 text-sm">· Now</span>
              <div className="ml-auto"><StatusBadge status={post.status} errorMessage={post.errorMessage} /></div>
            </div>
            {/* Content */}
            <p className="text-sm mt-1 whitespace-pre-wrap">{post.caption}</p>
            {post.hashtags.length > 0 && (
              <p className="text-sm text-blue-500 mt-1">{post.hashtags.map(h => `#${h}`).join(' ')}</p>
            )}
            {/* Image */}
            {platformImage ? (
              <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-[1200/675] object-cover rounded-xl mt-2" />
            ) : (
              <div className="w-full aspect-[1200/675] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-xl mt-2">
                <span className="text-gray-400 text-sm">Image will be attached</span>
              </div>
            )}
            {/* X Actions */}
            <div className="mt-3 flex gap-8 text-gray-500 text-sm">
              <span>💬</span>
              <span>🔄</span>
              <span>♡</span>
              <span>📊</span>
              <span>↗️</span>
            </div>
          </div>
        </div>
        <CharacterCount caption={post.caption} platform={post.platform} limit={280} />
      </div>
    )
  }

  // Google Business Profile-style card
  if (post.platform === 'GBP') {
    return (
      <div className={`rounded-lg overflow-hidden border shadow-sm bg-white ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
        {/* GBP Header */}
        <div className="px-4 py-3 flex items-center gap-3 bg-white border-b">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
            {businessName.charAt(0)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-gray-900">{businessName}</p>
            <p className="text-xs text-gray-500">Posted an update</p>
          </div>
          <StatusBadge status={post.status} errorMessage={post.errorMessage} />
        </div>
        {/* Image */}
        {platformImage ? (
          <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-[4/3] object-cover" />
        ) : (
          <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-sm">Image will be attached</span>
          </div>
        )}
        {/* Content */}
        <div className="px-4 py-3 bg-gray-50">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{post.caption}</p>
        </div>
        {/* GBP Call to Action */}
        <div className="px-4 py-3 border-t bg-white">
          <button className="w-full py-2 bg-blue-600 text-white text-sm rounded-full font-medium">
            Learn more
          </button>
        </div>
        <CharacterCount caption={post.caption} platform={post.platform} limit={400} />
      </div>
    )
  }

  // Default card for other platforms
  const platformConfig: Record<string, { bg: string; accent: string; name: string }> = {
    BLUESKY: { bg: 'bg-sky-50', accent: 'text-sky-600', name: 'Bluesky' },
    THREADS: { bg: 'bg-gray-50', accent: 'text-gray-900', name: 'Threads' },
    TIKTOK: { bg: 'bg-gray-900', accent: 'text-white', name: 'TikTok' },
    YOUTUBE: { bg: 'bg-red-50', accent: 'text-red-600', name: 'YouTube' },
  }
  const config = platformConfig[post.platform] || { bg: 'bg-gray-50', accent: 'text-gray-700', name: post.platform }
  const isDark = post.platform === 'TIKTOK'

  return (
    <div className={`rounded-lg overflow-hidden border shadow-sm ${isDark ? 'bg-gray-900' : 'bg-white'} ${isWRHQ ? 'ring-2 ring-purple-300' : ''}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${config.bg}`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{PLATFORM_ICONS[post.platform] || '📱'}</span>
          <span className={`font-semibold ${config.accent}`}>{config.name}</span>
          {isWRHQ && <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">WRHQ</span>}
        </div>
        <StatusBadge status={post.status} errorMessage={post.errorMessage} />
      </div>
      {/* Image */}
      {platformImage ? (
        <img src={platformImage.gcsUrl} alt={platformImage.altText || 'Post image'} className="w-full aspect-video object-cover" />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Image will be attached</span>
        </div>
      )}
      <div className={`px-4 py-3 ${isDark ? 'text-white' : ''}`}>
        <p className="text-sm whitespace-pre-wrap">{post.caption}</p>
        {post.hashtags.length > 0 && (
          <p className={`text-sm mt-2 ${config.accent}`}>{post.hashtags.map(h => `#${h}`).join(' ')}</p>
        )}
      </div>
      <CharacterCount caption={post.caption} platform={post.platform} />
    </div>
  )
}

// Helper component for status badge
function StatusBadge({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    PUBLISHED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Published' },
    SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Scheduled' },
    PROCESSING: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Processing' },
    FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
  }
  const config = statusConfig[status] || statusConfig.DRAFT

  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
      {status === 'FAILED' && errorMessage && (
        <span className="text-xs text-red-600 max-w-[200px] text-right" title={errorMessage}>
          {errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage}
        </span>
      )}
    </div>
  )
}

// Helper component for character count
function CharacterCount({ caption, platform, limit }: { caption: string; platform: string; limit?: number }) {
  const charLimit = limit || (platform === 'TWITTER' ? 280 : platform === 'GBP' ? 400 : undefined)
  const isOverLimit = charLimit && caption.length > charLimit

  return (
    <div className="px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
      <span className="text-xs text-gray-500">
        {caption.length} characters{charLimit ? ` / ${charLimit}` : ''}
      </span>
      {isOverLimit && <span className="text-xs text-red-500 font-medium">Over limit!</span>}
    </div>
  )
}

function SocialPostCard({
  post,
  isWRHQ = false,
}: {
  post: { platform: string; caption: string; hashtags: string[]; approved: boolean }
  isWRHQ?: boolean
}) {
  return (
    <div className={`border rounded-lg p-4 ${isWRHQ ? 'bg-purple-50 border-purple-200' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{PLATFORM_ICONS[post.platform] || '📱'}</span>
        <span className="font-medium">{post.platform}</span>
        {isWRHQ && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">WRHQ</span>
        )}
        {post.approved && (
          <Check className="h-4 w-4 text-green-500 ml-auto" />
        )}
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.caption}</p>
      {post.hashtags.length > 0 && (
        <p className="text-sm text-blue-600 mt-2">
          {post.hashtags.map(h => `#${h}`).join(' ')}
        </p>
      )}
      <p className="text-xs text-gray-400 mt-2">{post.caption.length} characters</p>
    </div>
  )
}
