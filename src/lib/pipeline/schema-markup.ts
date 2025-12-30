// Schema Markup Generation for Auto Glass Content

interface Client {
  businessName: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  email: string
  logoUrl: string | null
  wordpressUrl: string | null
  serviceAreas: string[]
  gbpRating: number | null
  gbpReviewCount: number | null
  hasAdasCalibration: boolean
  offersMobileService: boolean
}

interface BlogPost {
  title: string
  slug: string
  content: string
  excerpt: string | null
  metaDescription: string | null
  wordpressUrl: string | null
  publishedAt: Date | null
}

interface ContentItem {
  paaQuestion: string
}

interface SchemaParams {
  client: Client
  blogPost: BlogPost
  contentItem: ContentItem
  podcast?: {
    audioUrl: string
    duration: number | null
  }
  video?: {
    videoUrl: string
    thumbnailUrl: string | null
    duration: number | null
  }
}

export function generateSchemaGraph(params: SchemaParams): string {
  const { client, blogPost, contentItem, podcast, video } = params

  const baseUrl = client.wordpressUrl || ''
  const articleUrl = blogPost.wordpressUrl || `${baseUrl}/blog/${blogPost.slug}`
  const organizationId = `${baseUrl}#organization`
  const articleId = `${articleUrl}#article`

  // LocalBusiness Schema
  const localBusiness = {
    '@type': 'LocalBusiness',
    '@id': organizationId,
    name: client.businessName,
    image: client.logoUrl,
    url: baseUrl,
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
    areaServed: client.serviceAreas.map(area => ({
      '@type': 'City',
      name: area,
    })),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Windshield Replacement',
            description: 'Professional windshield replacement service',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Rock Chip Repair',
            description: 'Quick and affordable rock chip repair',
          },
        },
        ...(client.hasAdasCalibration
          ? [
              {
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'Service',
                  name: 'ADAS Calibration',
                  description: 'Advanced Driver Assistance System calibration',
                },
              },
            ]
          : []),
        ...(client.offersMobileService
          ? [
              {
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'Service',
                  name: 'Mobile Auto Glass Service',
                  description: 'Convenient mobile auto glass repair and replacement',
                },
              },
            ]
          : []),
      ],
    },
    ...(client.gbpRating && client.gbpReviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: client.gbpRating.toFixed(1),
            reviewCount: client.gbpReviewCount,
          },
        }
      : {}),
  }

  // BlogPosting Schema
  const blogPosting = {
    '@type': 'BlogPosting',
    '@id': articleId,
    headline: blogPost.title,
    description: blogPost.metaDescription || blogPost.excerpt,
    author: {
      '@type': 'Organization',
      '@id': organizationId,
    },
    publisher: {
      '@type': 'Organization',
      '@id': organizationId,
    },
    datePublished: blogPost.publishedAt?.toISOString(),
    dateModified: blogPost.publishedAt?.toISOString(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    about: {
      '@type': 'Thing',
      name: contentItem.paaQuestion,
    },
  }

  // FAQPage Schema
  const faqPage = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: contentItem.paaQuestion,
        acceptedAnswer: {
          '@type': 'Answer',
          text: getFirstParagraph(blogPost.content),
        },
      },
    ],
  }

  // Build the items list
  const itemListElements = [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'BlogPosting',
        '@id': articleId,
      },
    },
  ]

  // Add podcast if available
  let podcastEpisode
  if (podcast) {
    podcastEpisode = {
      '@type': 'PodcastEpisode',
      '@id': `${articleUrl}#podcast`,
      name: blogPost.title,
      description: blogPost.excerpt,
      audio: {
        '@type': 'AudioObject',
        contentUrl: podcast.audioUrl,
        duration: podcast.duration ? formatDuration(podcast.duration) : undefined,
      },
      partOfSeries: {
        '@type': 'PodcastSeries',
        name: `${client.businessName} Auto Glass Insights`,
      },
    }

    itemListElements.push({
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'PodcastEpisode',
        '@id': `${articleUrl}#podcast`,
      },
    })
  }

  // Add video if available
  let videoObject
  if (video) {
    videoObject = {
      '@type': 'VideoObject',
      '@id': `${articleUrl}#video`,
      name: blogPost.title,
      description: blogPost.excerpt,
      contentUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration ? formatDuration(video.duration) : undefined,
      uploadDate: blogPost.publishedAt?.toISOString(),
    }

    itemListElements.push({
      '@type': 'ListItem',
      position: itemListElements.length + 1,
      item: {
        '@type': 'VideoObject',
        '@id': `${articleUrl}#video`,
      },
    })
  }

  // ItemList linking all formats
  const itemList = {
    '@type': 'ItemList',
    name: `${blogPost.title} - All Formats`,
    itemListElement: itemListElements,
  }

  // Combine into graph
  const graph = [localBusiness, blogPosting, faqPage, itemList]

  if (podcastEpisode) graph.push(podcastEpisode)
  if (videoObject) graph.push(videoObject)

  const schema = {
    '@context': 'https://schema.org',
    '@graph': graph,
  }

  return JSON.stringify(schema, null, 2)
}

function getFirstParagraph(html: string): string {
  // Extract text from first paragraph
  const match = html.match(/<p[^>]*>(.*?)<\/p>/i)
  if (match) {
    return match[1].replace(/<[^>]*>/g, '').trim()
  }

  // Fallback to first 300 characters of text
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.substring(0, 300) + (text.length > 300 ? '...' : '')
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `PT${hours}H${minutes}M${secs}S`
  }
  if (minutes > 0) {
    return `PT${minutes}M${secs}S`
  }
  return `PT${secs}S`
}
