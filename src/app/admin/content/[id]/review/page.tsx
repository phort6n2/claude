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
  Code,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  AlertCircle,
  XCircle,
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
  schemaGenerated: boolean
  schemaUpdateCount: number
  schemaLastUpdated: string | null
  completionPercent: number
  client: {
    id: string
    businessName: string
    slug: string
  }
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
  }>
  wrhqSocialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: string[]
    approved: boolean
    status: string
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
  } | null
  videos: Array<{
    id: string
    videoType: string
    videoUrl: string
    thumbnailUrl: string | null
    duration: number | null
    status: string
  }>
}

type Tab = 'review' | 'published' | 'media'

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
          <button
            onClick={() => setActiveTab('media')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
              activeTab === 'media'
                ? 'bg-white border-t border-l border-r text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Video className="h-4 w-4 inline mr-2" />
            Media Enhancement
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
          <ReviewTab content={content} onApprove={updateApproval} saving={saving} onImageClick={setLightboxImage} onUpdate={loadContent} />
        )}
        {activeTab === 'published' && (
          <PublishedTab content={content} />
        )}
        {activeTab === 'media' && (
          <MediaTab content={content} onUpdate={loadContent} />
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
  onApprove,
  saving,
  onImageClick,
  onUpdate,
}: {
  content: ContentItem
  onApprove: (field: string, value: string) => void
  saving: boolean
  onImageClick: (image: { url: string; alt: string; type: string }) => void
  onUpdate: () => void
}) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  // Step status helpers
  const isStep1Complete = content.clientBlogPublished
  const isStep2Ready = content.blogGenerated && content.imagesGenerated
  const isStep2Complete = content.wrhqBlogPublished
  const isStep3Ready = isStep1Complete // Can generate social after blog published
  const isStep3Complete = content.socialPosts.every(p => p.status === 'SCHEDULED')
  const isStep4Ready = isStep1Complete // Can generate podcast after blog published
  const isStep4Complete = content.podcastAddedToPost

  async function generateContent(type: 'wrhqBlog' | 'social' | 'wrhqSocial' | 'podcast') {
    setGenerating(type)
    setError(null)
    try {
      const flags: Record<string, boolean> = {
        generateBlog: false,
        generateImages: false,
        generatePodcast: type === 'podcast',
        generateSocial: type === 'social',
        generateWrhqBlog: type === 'wrhqBlog',
        generateWrhqSocial: type === 'wrhqSocial',
      }

      const response = await fetch(`/api/content/${content.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Generation failed')
      }

      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setGenerating(null)
    }
  }

  async function publishContent(type: 'clientBlog' | 'wrhqBlog' | 'social' | 'wrhqSocial' | 'podcast') {
    setPublishing(type)
    setError(null)
    try {
      const flags: Record<string, boolean> = {
        publishClientBlog: type === 'clientBlog',
        publishWrhqBlog: type === 'wrhqBlog',
        scheduleSocial: type === 'social',
        scheduleWrhqSocial: type === 'wrhqSocial',
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

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Publishing failed')
        }
      }

      onUpdate()
    } catch (err) {
      setError(String(err))
    } finally {
      setPublishing(null)
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

      {/* PAA Question */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-600 font-medium">PAA Question</p>
        <p className="text-lg text-blue-900">{content.paaQuestion}</p>
      </div>

      {/* ============================================ */}
      {/* STEP 1: Client Blog - Review & Publish */}
      {/* ============================================ */}
      <section className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className={`px-6 py-4 flex items-center justify-between ${isStep1Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep1Complete ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
              {isStep1Complete ? <Check className="h-5 w-5" /> : '1'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Client Blog Post</h2>
              <p className="text-sm text-gray-500">Review blog and images, then publish to WordPress</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isStep1Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published</span>
                {content.clientBlogUrl && (
                  <a href={content.clientBlogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <button
                onClick={() => publishContent('clientBlog')}
                disabled={publishing === 'clientBlog' || !content.blogGenerated || !content.imagesGenerated || content.blogApproved !== 'APPROVED'}
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
                    Publish to WordPress
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Blog Post */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold">Blog Content</h3>
                {content.blogGenerated && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Generated</span>
                )}
              </div>
              <ApprovalCheckbox
                approved={content.blogApproved === 'APPROVED'}
                onChange={(checked) => onApprove('blogApproved', checked ? 'APPROVED' : 'PENDING')}
                label="Approve Blog"
                disabled={saving || isStep1Complete}
              />
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold">Images</h3>
                <span className="text-sm text-gray-500">({content.images.length} generated)</span>
              </div>
              <ApprovalCheckbox
                approved={content.imagesApproved === 'APPROVED'}
                onChange={(checked) => onApprove('imagesApproved', checked ? 'APPROVED' : 'PENDING')}
                label="Approve Images"
                disabled={saving || isStep1Complete}
              />
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
      </section>

      {/* ============================================ */}
      {/* STEP 2: WRHQ Blog - Generate & Publish */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div className={`px-6 py-4 flex items-center justify-between ${isStep2Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep2Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep2Complete ? <Check className="h-5 w-5" /> : '2'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">WRHQ Blog Post</h2>
              <p className="text-sm text-gray-500">Generate and publish WRHQ partner article</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!content.wrhqBlogGenerated ? (
              <button
                onClick={() => generateContent('wrhqBlog')}
                disabled={generating === 'wrhqBlog' || !isStep1Complete}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating === 'wrhqBlog' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4" />
                    Generate WRHQ Blog
                  </>
                )}
              </button>
            ) : isStep2Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published</span>
                {content.wrhqBlogUrl && (
                  <a href={content.wrhqBlogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <button
                onClick={() => publishContent('wrhqBlog')}
                disabled={publishing === 'wrhqBlog' || content.wrhqBlogApproved !== 'APPROVED'}
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
                    Publish WRHQ Blog
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {content.wrhqBlogPost && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">{content.wrhqBlogPost.title}</h4>
              <ApprovalCheckbox
                approved={content.wrhqBlogApproved === 'APPROVED'}
                onChange={(checked) => onApprove('wrhqBlogApproved', checked ? 'APPROVED' : 'PENDING')}
                label="Approve WRHQ Blog"
                disabled={saving || isStep2Complete}
              />
            </div>
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
        <div className={`px-6 py-4 flex items-center justify-between ${isStep3Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep3Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep3Complete ? <Check className="h-5 w-5" /> : '3'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Social Media Posts</h2>
              <p className="text-sm text-gray-500">Generate and schedule social media content</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Client Social Posts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold">Client Social Posts</h3>
                <span className="text-sm text-gray-500">({content.socialPosts.length} posts)</span>
              </div>
              <div className="flex items-center gap-3">
                {!content.socialGenerated ? (
                  <button
                    onClick={() => generateContent('social')}
                    disabled={generating === 'social' || !isStep1Complete}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generating === 'social' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Posts'
                    )}
                  </button>
                ) : (
                  <>
                    <ApprovalCheckbox
                      approved={content.socialApproved === 'APPROVED'}
                      onChange={(checked) => onApprove('socialApproved', checked ? 'APPROVED' : 'PENDING')}
                      label="Approve All"
                      disabled={saving}
                    />
                    <button
                      onClick={() => publishContent('social')}
                      disabled={publishing === 'social' || content.socialApproved !== 'APPROVED' || content.socialPosts.every(p => p.status === 'SCHEDULED')}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {publishing === 'social' ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Scheduling...
                        </>
                      ) : content.socialPosts.every(p => p.status === 'SCHEDULED') ? (
                        <>
                          <Check className="h-4 w-4" />
                          Scheduled
                        </>
                      ) : (
                        'Schedule All'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {content.socialPosts.length > 0 ? (
              <div className="grid gap-3">
                {content.socialPosts.map((post) => (
                  <SocialPostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Click "Generate Posts" to create social content</p>
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
              <div className="flex items-center gap-3">
                {!content.wrhqSocialGenerated ? (
                  <button
                    onClick={() => generateContent('wrhqSocial')}
                    disabled={generating === 'wrhqSocial' || !isStep1Complete}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generating === 'wrhqSocial' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate WRHQ Posts'
                    )}
                  </button>
                ) : (
                  <>
                    <ApprovalCheckbox
                      approved={content.wrhqSocialApproved === 'APPROVED'}
                      onChange={(checked) => onApprove('wrhqSocialApproved', checked ? 'APPROVED' : 'PENDING')}
                      label="Approve All"
                      disabled={saving}
                    />
                    <button
                      onClick={() => publishContent('wrhqSocial')}
                      disabled={publishing === 'wrhqSocial' || content.wrhqSocialApproved !== 'APPROVED' || content.wrhqSocialPosts.every(p => p.status === 'SCHEDULED')}
                      className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {publishing === 'wrhqSocial' ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Scheduling...
                        </>
                      ) : content.wrhqSocialPosts.every(p => p.status === 'SCHEDULED') ? (
                        <>
                          <Check className="h-4 w-4" />
                          Scheduled
                        </>
                      ) : (
                        'Schedule All'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {content.wrhqSocialPosts.length > 0 ? (
              <div className="grid gap-3">
                {content.wrhqSocialPosts.map((post) => (
                  <SocialPostCard key={post.id} post={post} isWRHQ />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Click "Generate WRHQ Posts" to create WRHQ social content</p>
            )}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* STEP 4: Podcast - Generate, Publish & Embed */}
      {/* ============================================ */}
      <section className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isStep1Complete ? 'opacity-60' : ''}`}>
        <div className={`px-6 py-4 flex items-center justify-between ${isStep4Complete ? 'bg-green-50 border-b border-green-100' : 'bg-gray-50 border-b'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isStep4Complete ? 'bg-green-500 text-white' : isStep1Complete ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {isStep4Complete ? <Check className="h-5 w-5" /> : '4'}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Podcast</h2>
              <p className="text-sm text-gray-500">Generate audio, publish to Podbean, embed in blog</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!content.podcastGenerated && (!content.podcast || content.podcast.status !== 'PROCESSING') ? (
              <button
                onClick={() => generateContent('podcast')}
                disabled={generating === 'podcast' || !isStep1Complete}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating === 'podcast' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Generate Podcast
                  </>
                )}
              </button>
            ) : content.podcast?.status === 'PROCESSING' ? (
              <div className="flex items-center gap-2 text-orange-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating audio (2-5 min)...</span>
              </div>
            ) : isStep4Complete ? (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Published & Embedded</span>
              </div>
            ) : content.podcast?.status === 'READY' ? (
              <button
                onClick={() => publishContent('podcast')}
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
                    Publish to Podbean & Embed
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>

        {(content.podcast?.status === 'READY' || content.podcastDescription) && (
          <div className="p-6 space-y-4">
            {content.podcast?.audioUrl && (
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

            {(content.podcastDescription || content.podcast?.description) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Podcast Description</label>
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
    </div>
  )
}

// ============================================
// TAB 2: PUBLISHED
// ============================================

function PublishedTab({ content }: { content: ContentItem }) {
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

      {/* Social Posts Status */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Social Posts Status</h2>
        <div className="space-y-2">
          {content.socialPosts.map((post) => (
            <div key={post.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span>{PLATFORM_ICONS[post.platform] || '📱'}</span>
                <span>{post.platform}</span>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                post.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {post.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ============================================
// TAB 3: MEDIA ENHANCEMENT
// ============================================

function MediaTab({ content, onUpdate }: { content: ContentItem; onUpdate: () => void }) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [podcastPolling, setPodcastPolling] = useState(false)

  // Poll for podcast status when processing
  useEffect(() => {
    if (content.podcast?.status !== 'PROCESSING' && content.podcastStatus !== 'processing') {
      return
    }

    setPodcastPolling(true)
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/content/${content.id}/podcast-status`)
        const data = await response.json()

        if (data.status === 'ready' || data.status === 'failed') {
          clearInterval(interval)
          setPodcastPolling(false)
          onUpdate() // Refresh content
        }
      } catch (error) {
        console.error('Error polling podcast status:', error)
      }
    }, 10000) // Poll every 10 seconds

    return () => clearInterval(interval)
  }, [content.id, content.podcast?.status, content.podcastStatus, onUpdate])

  async function generatePodcast() {
    setGenerating('podcast')
    try {
      await fetch(`/api/content/${content.id}/podcast`, { method: 'POST' })
      onUpdate()
    } catch (error) {
      console.error('Failed to generate podcast:', error)
    } finally {
      setGenerating(null)
    }
  }

  async function generateVideo() {
    setGenerating('video')
    try {
      await fetch(`/api/content/${content.id}/video`, { method: 'POST' })
      onUpdate()
    } catch (error) {
      console.error('Failed to generate video:', error)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Podcast Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Podcast</h2>
        </div>

        {content.podcast?.status === 'READY' && content.podcast.audioUrl ? (
          <div className="space-y-4">
            <audio controls className="w-full" src={content.podcast.audioUrl} />
            {content.podcast.duration && (
              <p className="text-sm text-gray-500">
                Duration: {Math.floor(content.podcast.duration / 60)}:{String(Math.round(content.podcast.duration) % 60).padStart(2, '0')}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Podcast Description
              </label>
              <div
                className="w-full border rounded-lg p-3 bg-gray-50 text-sm text-gray-700 max-h-48 overflow-y-auto prose prose-sm"
                dangerouslySetInnerHTML={{
                  __html: content.podcastDescription || content.podcast?.description || '<em class="text-gray-400">No description generated yet</em>'
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {content.podcastAddedToPost
                  ? `✓ Added to post on ${new Date(content.podcastAddedAt!).toLocaleDateString()}`
                  : 'Not added to blog post yet'}
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add to Blog Post
              </button>
            </div>
          </div>
        ) : content.podcast?.status === 'PROCESSING' || content.podcastStatus === 'processing' || podcastPolling ? (
          <div className="text-center py-8">
            <Mic className="h-12 w-12 text-blue-400 mx-auto mb-4 animate-pulse" />
            <p className="text-blue-600 font-medium mb-2">Podcast is being generated...</p>
            <p className="text-sm text-gray-500">This usually takes 2-5 minutes. The page will update automatically.</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Checking status...
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Mic className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No podcast generated yet</p>
            <button
              onClick={generatePodcast}
              disabled={generating === 'podcast'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generating === 'podcast' ? (
                <>
                  <RefreshCw className="h-4 w-4 inline mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                'Generate Podcast'
              )}
            </button>
          </div>
        )}
      </section>

      {/* Short Video Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Video className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Short Video (Creatify)</h2>
        </div>

        {content.videos.find(v => v.videoType === 'SHORT') ? (
          <div className="space-y-4">
            <video
              controls
              className="w-full max-w-md rounded-lg"
              src={content.videos.find(v => v.videoType === 'SHORT')?.videoUrl}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Video Description
              </label>
              <textarea
                className="w-full border rounded-lg p-3"
                rows={3}
                defaultValue={content.shortVideoDescription || ''}
                placeholder="Enter video description..."
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {content.shortVideoAddedToPost
                  ? `✓ Added to post`
                  : 'Not added to blog post yet'}
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add to Blog Post
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Video className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No short video generated yet</p>
            <button
              onClick={generateVideo}
              disabled={generating === 'video'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generating === 'video' ? (
                <>
                  <RefreshCw className="h-4 w-4 inline mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Video'
              )}
            </button>
          </div>
        )}
      </section>

      {/* Long-Form Video Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Video className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Long-Form Video</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              YouTube URL
            </label>
            <input
              type="url"
              className="w-full border rounded-lg p-3"
              placeholder="https://youtube.com/watch?v=..."
              defaultValue={content.longformVideoUrl || ''}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Video Description
            </label>
            <textarea
              className="w-full border rounded-lg p-3"
              rows={4}
              defaultValue={content.longformVideoDesc || ''}
              placeholder="Enter long-form video description..."
            />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save & Add to Blog Post
          </button>
        </div>
      </section>

      {/* Schema Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Code className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Schema Markup</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>
              Last updated: {content.schemaLastUpdated
                ? new Date(content.schemaLastUpdated).toLocaleString()
                : 'Never'}
            </span>
            <span>Update count: {content.schemaUpdateCount}</span>
          </div>

          {content.blogPost?.schemaJson && (
            <pre className="bg-gray-50 border rounded-lg p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(JSON.parse(content.blogPost.schemaJson), null, 2)}
            </pre>
          )}

          <div className="flex gap-3">
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
              <RefreshCw className="h-4 w-4 inline mr-2" />
              Regenerate Schema
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Update Blog Post with Schema
            </button>
          </div>
        </div>
      </section>
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
