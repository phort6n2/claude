import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ValidationIssue {
  type: 'error' | 'warning'
  schemaType: string
  field: string
  message: string
}

interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

// Convert duration in seconds to ISO 8601 format (PT#M#S)
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
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
 * Validates schema objects against Google Rich Results requirements
 * https://developers.google.com/search/docs/appearance/structured-data
 */
function validateSchemas(schemas: Record<string, unknown>[]): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  for (const schema of schemas) {
    const schemaType = schema['@type'] as string

    switch (schemaType) {
      case 'Article':
        // Required for Article rich results
        if (!schema.headline) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'headline', message: 'headline is required' })
        } else if (typeof schema.headline === 'string' && schema.headline.length > 110) {
          warnings.push({ type: 'warning', schemaType: 'Article', field: 'headline', message: 'headline should be under 110 characters' })
        }

        if (!schema.image) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'image', message: 'image is required for Article rich results' })
        } else if (Array.isArray(schema.image) && schema.image.length === 0) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'image', message: 'image array is empty' })
        }

        if (!schema.datePublished) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'datePublished', message: 'datePublished is required' })
        }

        // Check author
        const author = schema.author as Record<string, unknown> | undefined
        if (!author) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'author', message: 'author is required' })
        } else if (!author.name) {
          errors.push({ type: 'error', schemaType: 'Article', field: 'author.name', message: 'author must have a name property' })
        }

        // Check publisher
        const publisher = schema.publisher as Record<string, unknown> | undefined
        if (!publisher) {
          warnings.push({ type: 'warning', schemaType: 'Article', field: 'publisher', message: 'publisher is recommended' })
        } else {
          if (!publisher.name) {
            errors.push({ type: 'error', schemaType: 'Article', field: 'publisher.name', message: 'publisher must have a name property' })
          }
          if (!publisher.logo) {
            warnings.push({ type: 'warning', schemaType: 'Article', field: 'publisher.logo', message: 'publisher logo is recommended' })
          }
        }
        break

      case 'AutoRepair':
      case 'LocalBusiness':
        // Required for LocalBusiness rich results
        if (!schema.name) {
          errors.push({ type: 'error', schemaType, field: 'name', message: 'name is required' })
        }

        const address = schema.address as Record<string, unknown> | undefined
        if (!address) {
          warnings.push({ type: 'warning', schemaType, field: 'address', message: 'address is recommended for local SEO' })
        } else {
          if (!address.streetAddress) warnings.push({ type: 'warning', schemaType, field: 'address.streetAddress', message: 'streetAddress is recommended' })
          if (!address.addressLocality) warnings.push({ type: 'warning', schemaType, field: 'address.addressLocality', message: 'addressLocality (city) is recommended' })
          if (!address.addressRegion) warnings.push({ type: 'warning', schemaType, field: 'address.addressRegion', message: 'addressRegion (state) is recommended' })
        }

        if (!schema.telephone) {
          warnings.push({ type: 'warning', schemaType, field: 'telephone', message: 'telephone is recommended' })
        }

        // AggregateRating validation
        const rating = schema.aggregateRating as Record<string, unknown> | undefined
        if (rating) {
          if (!rating.ratingValue) {
            errors.push({ type: 'error', schemaType, field: 'aggregateRating.ratingValue', message: 'ratingValue is required when using aggregateRating' })
          }
          if (!rating.reviewCount && !rating.ratingCount) {
            errors.push({ type: 'error', schemaType, field: 'aggregateRating.reviewCount', message: 'reviewCount or ratingCount is required' })
          }
        }
        break

      case 'VideoObject':
        // Required for Video rich results
        if (!schema.name) {
          errors.push({ type: 'error', schemaType: 'VideoObject', field: 'name', message: 'name is required' })
        }

        if (!schema.description) {
          errors.push({ type: 'error', schemaType: 'VideoObject', field: 'description', message: 'description is required for Video rich results' })
        }

        if (!schema.thumbnailUrl) {
          errors.push({ type: 'error', schemaType: 'VideoObject', field: 'thumbnailUrl', message: 'thumbnailUrl is required' })
        }

        if (!schema.uploadDate) {
          errors.push({ type: 'error', schemaType: 'VideoObject', field: 'uploadDate', message: 'uploadDate is required' })
        }

        if (!schema.contentUrl && !schema.embedUrl) {
          errors.push({ type: 'error', schemaType: 'VideoObject', field: 'contentUrl/embedUrl', message: 'contentUrl or embedUrl is required' })
        }

        if (!schema.duration) {
          warnings.push({ type: 'warning', schemaType: 'VideoObject', field: 'duration', message: 'duration is recommended for Video rich results' })
        }
        break

      case 'PodcastEpisode':
        if (!schema.name) {
          errors.push({ type: 'error', schemaType: 'PodcastEpisode', field: 'name', message: 'name is required' })
        }

        if (!schema.description) {
          warnings.push({ type: 'warning', schemaType: 'PodcastEpisode', field: 'description', message: 'description is recommended' })
        }

        if (!schema.url) {
          warnings.push({ type: 'warning', schemaType: 'PodcastEpisode', field: 'url', message: 'url is recommended' })
        }

        const media = schema.associatedMedia as Record<string, unknown> | undefined
        if (!media?.contentUrl) {
          errors.push({ type: 'error', schemaType: 'PodcastEpisode', field: 'associatedMedia.contentUrl', message: 'audio contentUrl is required' })
        }
        break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * POST /api/content/[id]/generate-schema
 * Generates JSON-LD schema markup for the content item
 *
 * Creates separate schema objects (not using @graph with references)
 * for better compatibility with Google Rich Results Test
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

    // Build schema array (multiple separate schemas, not @graph)
    const schemas: Record<string, unknown>[] = []

    // Get featured image URL
    const featuredImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    const imageUrl = featuredImage?.gcsUrl || client.logoUrl

    // Build sameAs URLs for LocalBusiness
    const sameAsUrls: string[] = []
    if (client.googleMapsUrl) sameAsUrls.push(client.googleMapsUrl)
    if (client.wrhqDirectoryUrl) sameAsUrls.push(client.wrhqDirectoryUrl)
    if (client.socialAccountIds && typeof client.socialAccountIds === 'object') {
      const socialIds = client.socialAccountIds as Record<string, string>
      Object.values(socialIds).forEach(value => {
        if (typeof value === 'string' && value.startsWith('http')) {
          sameAsUrls.push(value)
        }
      })
    }

    // 1. LocalBusiness Schema (AutoRepair)
    const localBusinessSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'AutoRepair',
      '@id': `${baseUrl}/#business`,
      name: client.businessName,
      description: `${client.businessName} provides professional auto glass repair and windshield replacement services in ${client.city}, ${client.state}.`,
      url: client.wordpressUrl,
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

    if (client.logoUrl) {
      localBusinessSchema.image = client.logoUrl
    }

    if (client.gbpRating && client.gbpReviewCount) {
      localBusinessSchema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: client.gbpRating,
        reviewCount: client.gbpReviewCount,
        bestRating: 5,
        worstRating: 1,
      }
    }

    if (sameAsUrls.length > 0) {
      localBusinessSchema.sameAs = sameAsUrls
    }

    schemas.push(localBusinessSchema)

    // 2. Article Schema (with inline author/publisher - required for rich results)
    const articleSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': articleUrl,
      },
      headline: blogPost.title,
      description: blogPost.excerpt || blogPost.metaDescription || `Learn about ${blogPost.title}`,
      // Image must be an array of URLs for Article rich results
      image: imageUrl ? [imageUrl] : undefined,
      datePublished: blogPost.publishedAt?.toISOString() || contentItem.publishedAt?.toISOString() || new Date().toISOString(),
      dateModified: blogPost.updatedAt?.toISOString() || new Date().toISOString(),
      // Author must have name property inline (not just @id reference)
      author: {
        '@type': 'Organization',
        name: client.businessName,
        url: client.wordpressUrl,
      },
      // Publisher must have name and logo inline
      publisher: {
        '@type': 'Organization',
        name: client.businessName,
        url: client.wordpressUrl,
        logo: client.logoUrl ? {
          '@type': 'ImageObject',
          url: client.logoUrl,
        } : undefined,
      },
      wordCount: blogPost.wordCount || undefined,
    }

    schemas.push(articleSchema)

    // 3. VideoObject Schemas (separate from Article for better rich results)
    const youtubeShortPost = contentItem.socialPosts.find(p => p.platform === 'YOUTUBE' && p.publishedUrl) ||
                            contentItem.wrhqSocialPosts.find(p => p.platform === 'YOUTUBE' && p.publishedUrl)

    if (youtubeShortPost?.publishedUrl) {
      const ytVideoId = getYouTubeVideoId(youtubeShortPost.publishedUrl)
      const thumbnailUrl = ytVideoId
        ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg`
        : imageUrl

      const shortVideoSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: `${blogPost.title} - Quick Tips`,
        description: contentItem.shortVideoDescription || blogPost.excerpt || `Quick tips about ${blogPost.title}`,
        thumbnailUrl: thumbnailUrl,
        uploadDate: youtubeShortPost.publishedAt?.toISOString() || new Date().toISOString(),
        contentUrl: youtubeShortPost.publishedUrl,
        embedUrl: ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}` : undefined,
        // Duration is required for video rich results - default to 30 seconds for shorts
        duration: 'PT30S',
      }

      schemas.push(shortVideoSchema)
    }

    if (contentItem.longformVideoUrl) {
      const ytVideoId = getYouTubeVideoId(contentItem.longformVideoUrl)
      const thumbnailUrl = ytVideoId
        ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg`
        : imageUrl

      const longVideoSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: blogPost.title,
        description: contentItem.longformVideoDesc || blogPost.excerpt || `Learn about ${blogPost.title}`,
        thumbnailUrl: thumbnailUrl,
        uploadDate: new Date().toISOString(),
        contentUrl: contentItem.longformVideoUrl,
        embedUrl: ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}` : undefined,
        // Default duration for long-form videos - 5 minutes
        duration: 'PT5M',
      }

      schemas.push(longVideoSchema)
    }

    // 4. AudioObject/PodcastEpisode Schema
    if (contentItem.podcast?.podbeanUrl || contentItem.podcast?.audioUrl) {
      const podcastSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'PodcastEpisode',
        name: `${blogPost.title} - Podcast Episode`,
        description: contentItem.podcastDescription || blogPost.excerpt || `Podcast episode about ${blogPost.title}`,
        url: contentItem.podcast.podbeanUrl || contentItem.podcast.audioUrl,
        datePublished: new Date().toISOString(),
        associatedMedia: {
          '@type': 'AudioObject',
          contentUrl: contentItem.podcast.audioUrl || contentItem.podcast.podbeanUrl,
          encodingFormat: 'audio/mpeg',
          duration: contentItem.podcast.duration ? formatDuration(contentItem.podcast.duration) : 'PT5M',
        },
        partOfSeries: {
          '@type': 'PodcastSeries',
          name: `${client.businessName} Auto Glass Tips`,
          url: client.podbeanPodcastUrl || client.wordpressUrl,
        },
      }

      schemas.push(podcastSchema)
    }

    // Validate the generated schemas
    const validation = validateSchemas(schemas)

    // Combine all schemas into a single JSON string
    // Each schema is a separate object for better Google compatibility
    const schemaJson = JSON.stringify(schemas, null, 2)

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
      schema: schemas,
      validation,
      message: validation.valid
        ? 'Schema markup generated successfully - all validations passed!'
        : `Schema generated with ${validation.errors.length} error(s) and ${validation.warnings.length} warning(s)`,
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

    const schemas = JSON.parse(contentItem.blogPost.schemaJson)
    const validation = validateSchemas(Array.isArray(schemas) ? schemas : [schemas])

    return NextResponse.json({
      success: true,
      schema: schemas,
      validation,
      schemaGenerated: contentItem.schemaGenerated,
      schemaUpdateCount: contentItem.schemaUpdateCount,
      schemaLastUpdated: contentItem.schemaLastUpdated,
    })
  } catch (error) {
    console.error('Get schema error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
