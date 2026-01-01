'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'

interface ContentItem {
  id: string
  paaQuestion: string
  status: string
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
  podcast: {
    id: string
    audioUrl: string
    duration: number | null
    script: string | null
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
  const [content, setContent] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('review')
  const [saving, setSaving] = useState(false)

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
              <div className="flex items-center gap-2 text-blue-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Generating content...</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                {approvedCount} of {totalRequired} approved
              </div>
            )}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              content.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
              content.status === 'REVIEW' ? 'bg-yellow-100 text-yellow-700' :
              content.status === 'GENERATING' ? 'bg-blue-100 text-blue-700 animate-pulse' :
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

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'review' && (
          <ReviewTab content={content} onApprove={updateApproval} saving={saving} />
        )}
        {activeTab === 'published' && (
          <PublishedTab content={content} />
        )}
        {activeTab === 'media' && (
          <MediaTab content={content} onUpdate={loadContent} />
        )}
      </div>
    </div>
  )
}

// ============================================
// TAB 1: REVIEW CONTENT
// ============================================

function ReviewTab({
  content,
  onApprove,
  saving,
}: {
  content: ContentItem
  onApprove: (field: string, value: string) => void
  saving: boolean
}) {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* PAA Question */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-600 font-medium">PAA Question</p>
        <p className="text-lg text-blue-900">{content.paaQuestion}</p>
      </div>

      {/* Blog Post Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Blog Post</h2>
            {content.blogGenerated && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                Generated
              </span>
            )}
          </div>
          <ApprovalCheckbox
            approved={content.blogApproved === 'APPROVED'}
            onChange={(checked) => onApprove('blogApproved', checked ? 'APPROVED' : 'PENDING')}
            label="Approve Blog"
            disabled={saving}
          />
        </div>

        {content.blogPost ? (
          <div>
            <h3 className="text-xl font-bold mb-2">{content.blogPost.title}</h3>
            {content.blogPost.excerpt && (
              <p className="text-gray-600 mb-4 italic">{content.blogPost.excerpt}</p>
            )}
            <div className="flex gap-4 text-sm text-gray-500 mb-4">
              <span>{content.blogPost.wordCount} words</span>
              {content.blogPost.metaDescription && (
                <span>Meta: {content.blogPost.metaDescription.length} chars</span>
              )}
            </div>
            <div
              className="prose max-w-none border rounded-lg p-4 bg-gray-50"
              dangerouslySetInnerHTML={{ __html: content.blogPost.content }}
            />
          </div>
        ) : (
          <p className="text-gray-500">Blog post not yet generated</p>
        )}
      </section>

      {/* Images Section */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Images</h2>
            <span className="text-sm text-gray-500">
              ({content.images.filter(i => i.approved).length}/{content.images.length} approved)
            </span>
          </div>
          <ApprovalCheckbox
            approved={content.imagesApproved === 'APPROVED'}
            onChange={(checked) => onApprove('imagesApproved', checked ? 'APPROVED' : 'PENDING')}
            label="Approve All Images"
            disabled={saving}
          />
        </div>

        {content.images.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {content.images.map((image) => (
              <div key={image.id} className="border rounded-lg overflow-hidden">
                <img
                  src={image.gcsUrl}
                  alt={image.altText || image.imageType}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-600">
                    {image.imageType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400">{image.width}x{image.height}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No images generated yet</p>
        )}
      </section>

      {/* Client Social Posts */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Client Social Posts</h2>
            <span className="text-sm text-gray-500">
              ({content.socialPosts.filter(p => p.approved).length}/{content.socialPosts.length} approved)
            </span>
          </div>
          <ApprovalCheckbox
            approved={content.socialApproved === 'APPROVED'}
            onChange={(checked) => onApprove('socialApproved', checked ? 'APPROVED' : 'PENDING')}
            label="Approve All Social"
            disabled={saving}
          />
        </div>

        {content.socialPosts.length > 0 ? (
          <div className="grid gap-4">
            {content.socialPosts.map((post) => (
              <SocialPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No social posts generated yet</p>
        )}
      </section>

      {/* WRHQ Content */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold">WRHQ Content</h2>
        </div>

        {/* WRHQ Blog */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">WRHQ Blog Post</h3>
            <ApprovalCheckbox
              approved={content.wrhqBlogApproved === 'APPROVED'}
              onChange={(checked) => onApprove('wrhqBlogApproved', checked ? 'APPROVED' : 'PENDING')}
              label="Approve"
              disabled={saving}
            />
          </div>
          <p className="text-sm text-gray-500">
            {content.wrhqBlogGenerated ? 'Generated - ready for review' : 'Not yet generated'}
          </p>
        </div>

        {/* WRHQ Social */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">WRHQ Social Posts</h3>
            <ApprovalCheckbox
              approved={content.wrhqSocialApproved === 'APPROVED'}
              onChange={(checked) => onApprove('wrhqSocialApproved', checked ? 'APPROVED' : 'PENDING')}
              label="Approve All"
              disabled={saving}
            />
          </div>
          {content.wrhqSocialPosts.length > 0 ? (
            <div className="grid gap-4">
              {content.wrhqSocialPosts.map((post) => (
                <SocialPostCard key={post.id} post={post} isWRHQ />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Not yet generated</p>
          )}
        </div>
      </section>

      {/* Action Bar */}
      <div className="bg-white rounded-lg shadow-sm border p-4 sticky bottom-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {saving ? 'Saving...' : `${content.completionPercent}% complete`}
        </div>
        <div className="flex gap-3">
          <button
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            onClick={() => {
              // Approve all
              onApprove('blogApproved', 'APPROVED')
              onApprove('imagesApproved', 'APPROVED')
              onApprove('socialApproved', 'APPROVED')
              onApprove('wrhqBlogApproved', 'APPROVED')
              onApprove('wrhqSocialApproved', 'APPROVED')
            }}
          >
            <Check className="h-4 w-4 inline mr-2" />
            Approve All
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={content.status !== 'REVIEW'}
          >
            Publish Now
          </button>
        </div>
      </div>
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

        {content.podcast ? (
          <div className="space-y-4">
            <audio controls className="w-full" src={content.podcast.audioUrl} />
            {content.podcast.duration && (
              <p className="text-sm text-gray-500">
                Duration: {Math.floor(content.podcast.duration / 60)}:{String(content.podcast.duration % 60).padStart(2, '0')}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Podcast Description
              </label>
              <textarea
                className="w-full border rounded-lg p-3"
                rows={4}
                defaultValue={content.podcastDescription || ''}
                placeholder="Enter podcast description for the blog post..."
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
                  Generating...
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
