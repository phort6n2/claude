import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface SchemaGraph {
  '@context': string
  '@graph': (ArticleSchema | LocalBusinessSchema | VideoObjectSchema | AudioObjectSchema | ImageObjectSchema)[]
}

interface ArticleSchema {
  '@type': 'Article'
  '@id': string
  mainEntityOfPage: { '@id': string }
  headline: string
  description?: string
  image?: { '@id': string }
  video?: { '@id': string }[]
  audio?: { '@id': string }
  datePublished?: string
  dateModified?: string
  author: { '@id': string }
  publisher: { '@id': string }
  wordCount?: number
}

interface LocalBusinessSchema {
  '@type': 'AutoRepair'
  '@id': string
  name: string
  description?: string
  image?: string
  url?: string
  telephone?: string
  email?: string
  address?: {
    '@type': 'PostalAddress'
    streetAddress: string
    addressLocality: string
    addressRegion: string
    postalCode: string
    addressCountry: string
  }
  geo?: {
    '@type': 'GeoCoordinates'
    latitude: number
    longitude: number
  }
  aggregateRating?: {
    '@type': 'AggregateRating'
    ratingValue: number
    reviewCount: number
  }
  sameAs?: string[]
  priceRange?: string
}

interface VideoObjectSchema {
  '@type': 'VideoObject'
  '@id': string
  name: string
  description?: string
  thumbnailUrl?: string
  uploadDate?: string
  contentUrl?: string
  embedUrl?: string
  duration?: string
}

interface AudioObjectSchema {
  '@type': 'AudioObject'
  '@id': string
  name: string
  description?: string
  contentUrl?: string
  encodingFormat?: string
  duration?: string
}

interface ImageObjectSchema {
  '@type': 'ImageObject'
  '@id': string
  url: string
  width?: number
  height?: number
  caption?: string
}

// Convert duration in seconds to ISO 8601 format (PT#M#S)
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `PT${minutes}M${remainingSeconds}S`
}

// Extract YouTube video ID
function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.includes('/shorts/')) {
        return parsed.pathname.split('/shorts/')[1]?.split('?')[0] || null
      }
      return parsed.searchParams.get('v')
    } else if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1).split('?')[0] || null
    }
  } catch {
    return null
  }
  return null
}

/**
 * POST /api/content/[id]/generate-schema
 * Generates JSON-LD schema markup for the content item
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get content item with all related data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
        socialPosts: true,
        wrhqSocialPosts: true,
        images: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    if (!contentItem.blogPost) {
      return NextResponse.json({ error: 'Blog post not found' }, { status: 400 })
    }

    const client = contentItem.client
    const blogPost = contentItem.blogPost
    const baseUrl = client.wordpressUrl || `https://example.com`
    const articleUrl = blogPost.wordpressUrl || `${baseUrl}/${blogPost.slug}`

    // Build the schema graph
    const graph: SchemaGraph['@graph'] = []

    // 1. LocalBusiness Schema (AutoRepair type for auto glass)
    const businessId = `${baseUrl}/#business`
    const sameAsUrls: string[] = []

    // Add all known URLs to sameAs
    if (client.googleMapsUrl) sameAsUrls.push(client.googleMapsUrl)
    if (client.wrhqDirectoryUrl) sameAsUrls.push(client.wrhqDirectoryUrl)

    // Add social media URLs from socialAccountIds if available
    if (client.socialAccountIds && typeof client.socialAccountIds === 'object') {
      const socialIds = client.socialAccountIds as Record<string, string>
      // These would be profile URLs, but we may only have IDs
      // For now, include any URLs stored
      Object.values(socialIds).forEach(value => {
        if (typeof value === 'string' && value.startsWith('http')) {
          sameAsUrls.push(value)
        }
      })
    }

    const localBusiness: LocalBusinessSchema = {
      '@type': 'AutoRepair',
      '@id': businessId,
      name: client.businessName,
      description: `${client.businessName} provides professional auto glass repair and windshield replacement services in ${client.city}, ${client.state}.`,
      url: client.wordpressUrl || undefined,
      telephone: client.phone,
      email: client.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: client.streetAddress,
        addressLocality: client.city,
        addressRegion: client.state,
        postalCode: client.postalCode,
        addressCountry: client.country,
      },
      priceRange: '$$',
    }

    // Add logo if available
    if (client.logoUrl) {
      localBusiness.image = client.logoUrl
    }

    // Add aggregate rating if available
    if (client.gbpRating && client.gbpReviewCount) {
      localBusiness.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: client.gbpRating,
        reviewCount: client.gbpReviewCount,
      }
    }

    // Add sameAs if we have URLs
    if (sameAsUrls.length > 0) {
      localBusiness.sameAs = sameAsUrls
    }

    graph.push(localBusiness)

    // 2. Featured Image Schema
    const featuredImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    let imageId: string | undefined

    if (featuredImage) {
      imageId = `${articleUrl}/#image`
      const imageSchema: ImageObjectSchema = {
        '@type': 'ImageObject',
        '@id': imageId,
        url: featuredImage.gcsUrl,
        width: featuredImage.width,
        height: featuredImage.height,
        caption: featuredImage.altText || blogPost.title,
      }
      graph.push(imageSchema)
    }

    // 3. Video Schemas
    const videoIds: string[] = []

    // Short-form video (YouTube Shorts)
    const youtubeShortPost = contentItem.socialPosts.find(p => p.platform === 'YOUTUBE' && p.publishedUrl) ||
                            contentItem.wrhqSocialPosts.find(p => p.platform === 'YOUTUBE' && p.publishedUrl)

    if (youtubeShortPost?.publishedUrl) {
      const shortVideoId = `${articleUrl}/#short-video`
      videoIds.push(shortVideoId)

      const ytVideoId = getYouTubeVideoId(youtubeShortPost.publishedUrl)

      const shortVideoSchema: VideoObjectSchema = {
        '@type': 'VideoObject',
        '@id': shortVideoId,
        name: `${blogPost.title} - Quick Tips`,
        description: contentItem.shortVideoDescription || blogPost.excerpt || undefined,
        thumbnailUrl: ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg` : undefined,
        uploadDate: youtubeShortPost.publishedAt?.toISOString(),
        contentUrl: youtubeShortPost.publishedUrl,
        embedUrl: ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}` : undefined,
      }
      graph.push(shortVideoSchema)
    }

    // Long-form video (YouTube)
    if (contentItem.longformVideoUrl) {
      const longVideoId = `${articleUrl}/#long-video`
      videoIds.push(longVideoId)

      const ytVideoId = getYouTubeVideoId(contentItem.longformVideoUrl)

      const longVideoSchema: VideoObjectSchema = {
        '@type': 'VideoObject',
        '@id': longVideoId,
        name: blogPost.title,
        description: contentItem.longformVideoDesc || blogPost.excerpt || undefined,
        thumbnailUrl: ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg` : undefined,
        contentUrl: contentItem.longformVideoUrl,
        embedUrl: ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}` : undefined,
      }
      graph.push(longVideoSchema)
    }

    // 4. Audio/Podcast Schema
    let audioId: string | undefined

    if (contentItem.podcast?.podbeanUrl || contentItem.podcast?.audioUrl) {
      audioId = `${articleUrl}/#podcast`

      const audioSchema: AudioObjectSchema = {
        '@type': 'AudioObject',
        '@id': audioId,
        name: `${blogPost.title} - Podcast Episode`,
        description: contentItem.podcastDescription || blogPost.excerpt || undefined,
        contentUrl: contentItem.podcast.audioUrl || contentItem.podcast.podbeanUrl || undefined,
        encodingFormat: 'audio/mpeg',
        duration: contentItem.podcast.duration ? formatDuration(contentItem.podcast.duration) : undefined,
      }
      graph.push(audioSchema)
    }

    // 5. Article Schema (main entity, references everything else)
    const articleSchema: ArticleSchema = {
      '@type': 'Article',
      '@id': `${articleUrl}/#article`,
      mainEntityOfPage: { '@id': articleUrl },
      headline: blogPost.title,
      description: blogPost.excerpt || blogPost.metaDescription || undefined,
      datePublished: blogPost.publishedAt?.toISOString() || contentItem.publishedAt?.toISOString(),
      dateModified: blogPost.updatedAt?.toISOString(),
      author: { '@id': businessId },
      publisher: { '@id': businessId },
      wordCount: blogPost.wordCount || undefined,
    }

    // Link to image
    if (imageId) {
      articleSchema.image = { '@id': imageId }
    }

    // Link to videos
    if (videoIds.length > 0) {
      articleSchema.video = videoIds.map(vid => ({ '@id': vid }))
    }

    // Link to audio
    if (audioId) {
      articleSchema.audio = { '@id': audioId }
    }

    graph.push(articleSchema)

    // Build final schema
    const schemaGraph: SchemaGraph = {
      '@context': 'https://schema.org',
      '@graph': graph,
    }

    const schemaJson = JSON.stringify(schemaGraph, null, 2)

    // Save to database
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: { schemaJson },
    })

    await prisma.contentItem.update({
      where: { id },
      data: {
        schemaGenerated: true,
        schemaUpdateCount: { increment: 1 },
        schemaLastUpdated: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      schema: schemaGraph,
      message: 'Schema markup generated successfully',
    })
  } catch (error) {
    console.error('Generate schema error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * GET /api/content/[id]/generate-schema
 * Returns the current schema if it exists
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: { blogPost: true },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    if (!contentItem.blogPost?.schemaJson) {
      return NextResponse.json({ error: 'No schema generated yet' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      schema: JSON.parse(contentItem.blogPost.schemaJson),
      schemaGenerated: contentItem.schemaGenerated,
      schemaUpdateCount: contentItem.schemaUpdateCount,
      schemaLastUpdated: contentItem.schemaLastUpdated,
    })
  } catch (error) {
    console.error('Get schema error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
