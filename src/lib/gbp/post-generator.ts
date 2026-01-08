// GBP Post Generation Service
// AI-powered content generation for standalone GBP posting

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { Client, GBPPostConfig, GBPCtaType } from '@prisma/client'
import { selectRandomPhoto } from '@/lib/integrations/google-business'
import { generateImage as generateNanoBananaImage } from '@/lib/integrations/nano-banana'
import { uploadFromUrl } from '@/lib/integrations/gcs'
import { getSetting } from '@/lib/settings'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Link rotation types
export interface RotationLink {
  url: string
  label: string
  type: 'service_page' | 'blog' | 'wrhq' | 'google_maps' | 'citation' | 'custom'
  weight?: number  // Higher weight = more frequent selection
}

// Post topics for variety
const DEFAULT_POST_TOPICS = [
  'windshield repair tips',
  'ADAS calibration importance',
  'mobile service convenience',
  'rock chip repair benefits',
  'when to repair vs replace',
  'insurance claims process',
  'OEM vs aftermarket glass',
  'safety features in modern windshields',
  'seasonal driving tips',
  'customer service excellence',
]

interface GeneratePostParams {
  client: Client
  config: GBPPostConfig
  topic?: string
  ctaUrl?: string
  ctaLabel?: string
}

interface GeneratedPost {
  content: string
  photoUrl: string | null
  photoSource: 'GBP_PROFILE' | 'AI_GENERATED' | 'CLIENT_IMAGES'
  ctaUrl: string | null
  ctaType: GBPCtaType | null
  rotationLinkIndex: number | null
  rotationLinkLabel: string | null
}

/**
 * Get the next link in the rotation
 */
export function getNextRotationLink(config: GBPPostConfig): RotationLink | null {
  const links = config.rotationLinks as RotationLink[] | null

  if (!links || links.length === 0) {
    return null
  }

  // Get the current index, wrapping around if needed
  const index = (config.currentLinkIndex || 0) % links.length
  return links[index]
}

/**
 * Increment the rotation link index
 */
export async function incrementLinkRotation(configId: string): Promise<void> {
  const config = await prisma.gBPPostConfig.findUnique({
    where: { id: configId },
  })

  if (!config) return

  const links = config.rotationLinks as RotationLink[] | null
  if (!links || links.length === 0) return

  const nextIndex = ((config.currentLinkIndex || 0) + 1) % links.length

  await prisma.gBPPostConfig.update({
    where: { id: configId },
    data: { currentLinkIndex: nextIndex },
  })
}

/**
 * Select a topic for the post
 */
function selectTopic(config: GBPPostConfig): string {
  const topics = config.postTopics.length > 0
    ? config.postTopics
    : DEFAULT_POST_TOPICS

  const randomIndex = Math.floor(Math.random() * topics.length)
  return topics[randomIndex]
}

/**
 * Get client services list for context
 */
function getClientServices(client: Client): string[] {
  const services: string[] = []

  if (client.offersWindshieldRepair) services.push('windshield repair')
  if (client.offersWindshieldReplacement) services.push('windshield replacement')
  if (client.offersSideWindowRepair) services.push('side window repair')
  if (client.offersBackWindowRepair) services.push('back window repair')
  if (client.offersSunroofRepair) services.push('sunroof repair')
  if (client.offersRockChipRepair) services.push('rock chip repair')
  if (client.offersAdasCalibration) services.push('ADAS calibration')
  if (client.offersMobileService) services.push('mobile service')

  return services
}

/**
 * Generate AI post content using Claude
 */
async function generatePostContent(params: {
  businessName: string
  city: string
  state: string
  topic: string
  services: string[]
  serviceAreas: string[]
  phone: string
  includePromo: boolean
  includePhone: boolean
  ctaLabel?: string
}): Promise<string> {
  const prompt = `Generate a Google Business Profile post for ${params.businessName}, an auto glass repair company in ${params.city}, ${params.state}.

**CRITICAL REQUIREMENTS:**
- Length: 300-700 characters (GBP posts should be engaging but concise)
- NO phone numbers in the text (they often get flagged)
- 1-3 relevant emojis allowed (use sparingly and tastefully)
- NO hashtags
- Professional, local, and friendly tone
- Focus on providing VALUE to potential customers

**BUSINESS CONTEXT:**
- Services: ${params.services.join(', ')}
- Service Areas: ${params.serviceAreas.join(', ')}
- Phone: ${params.phone}

**POST TOPIC:** ${params.topic}

**WRITING GUIDELINES:**
1. Start with an attention-grabbing statement or question related to the topic
2. Provide 1-2 useful insights or tips about the topic
3. Mention ${params.businessName} naturally (not forced)
4. ${params.includePromo ? 'Include a promotional offer or value proposition (free quote, warranty mention, etc.)' : 'Focus on educational value without heavy promotion'}
5. End with a compelling call-to-action: "${params.ctaLabel || 'Learn More'}"

**TONE:**
- Conversational but professional
- Locally focused (mention the city/area naturally)
- Helpful and educational
- Builds trust and expertise

**OUTPUT:**
Return ONLY the post text. No quotes, no labels, no explanation. Just the post content ready to publish.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : ''

  // Ensure we don't exceed GBP's character limit (1500 chars)
  if (content.length > 1500) {
    return content.substring(0, 1497) + '...'
  }

  return content
}

/**
 * Get a photo for the post
 * Priority: GBP profile photos > AI generated > null
 */
async function getPostPhoto(
  clientId: string,
  config: GBPPostConfig,
  topic: string,
  client: Client
): Promise<{ url: string | null; source: 'GBP_PROFILE' | 'AI_GENERATED' | 'CLIENT_IMAGES' }> {
  // Try GBP profile photos first
  try {
    const gbpPhoto = await selectRandomPhoto(clientId, ['EXTERIOR', 'INTERIOR', 'COVER'])
    if (gbpPhoto?.mediaUrl) {
      return { url: gbpPhoto.mediaUrl, source: 'GBP_PROFILE' }
    }
  } catch (error) {
    console.log('Could not get GBP photos:', error)
  }

  // If configured for AI generation and no GBP photos available
  if (config.useAiGeneratedImages) {
    try {
      const apiKey = process.env.NANO_BANANA_API_KEY || await getSetting('NANO_BANANA_API_KEY')

      if (apiKey) {
        const result = await generateNanoBananaImage({
          businessName: client.businessName,
          city: client.city,
          state: client.state,
          paaQuestion: topic, // Use topic as the question for image generation
          phone: client.phone,
          website: client.wordpressUrl || '',
          address: `${client.streetAddress}, ${client.city}, ${client.state}`,
          aspectRatio: '1:1',  // Square works well for GBP
          apiKey,
        })

        if (result.url) {
          // Upload to GCS for permanent storage (result.url is a data URL)
          const filename = `gbp-posts/${clientId}/${Date.now()}-ai-generated.jpg`
          const uploaded = await uploadFromUrl(result.url, filename)
          return { url: uploaded.url, source: 'AI_GENERATED' }
        }
      }
    } catch (error) {
      console.error('AI image generation failed:', error)
    }
  }

  // Check for existing client images
  try {
    const clientImages = await prisma.image.findMany({
      where: {
        clientId,
        approved: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    if (clientImages.length > 0) {
      const randomIndex = Math.floor(Math.random() * clientImages.length)
      return { url: clientImages[randomIndex].gcsUrl, source: 'CLIENT_IMAGES' }
    }
  } catch (error) {
    console.log('Could not get client images:', error)
  }

  return { url: null, source: 'GBP_PROFILE' }
}

/**
 * Generate a complete GBP post with content and photo
 */
export async function generateGBPPost(params: GeneratePostParams): Promise<GeneratedPost> {
  const { client, config, topic: providedTopic, ctaUrl: providedCtaUrl, ctaLabel: providedCtaLabel } = params

  // Select topic
  const topic = providedTopic || selectTopic(config)

  // Get next rotation link if not provided
  let ctaUrl = providedCtaUrl
  let ctaLabel = providedCtaLabel
  let rotationLinkIndex: number | null = null
  let rotationLinkLabel: string | null = null

  if (!ctaUrl) {
    const nextLink = getNextRotationLink(config)
    if (nextLink) {
      ctaUrl = nextLink.url
      ctaLabel = nextLink.label
      rotationLinkIndex = (config.currentLinkIndex || 0) % ((config.rotationLinks as unknown as RotationLink[])?.length || 1)
      rotationLinkLabel = nextLink.label
    }
  }

  // Generate content
  const content = await generatePostContent({
    businessName: client.businessName,
    city: client.city,
    state: client.state,
    topic,
    services: getClientServices(client),
    serviceAreas: client.serviceAreas,
    phone: client.phone,
    includePromo: config.includePromo,
    includePhone: config.includePhone,
    ctaLabel: ctaLabel || 'Learn More',
  })

  // Get photo
  const photo = await getPostPhoto(client.id, config, topic, client)

  // Determine CTA type
  let ctaType: GBPCtaType | null = null
  if (ctaUrl) {
    ctaType = 'LEARN_MORE' // Default CTA type
  }

  return {
    content,
    photoUrl: photo.url,
    photoSource: photo.source,
    ctaUrl: ctaUrl || null,
    ctaType,
    rotationLinkIndex,
    rotationLinkLabel,
  }
}

/**
 * Check if a client is due for posting based on their schedule
 */
export function isClientDueForPosting(config: GBPPostConfig & {
  posts?: { publishedAt: Date | null }[]
}): boolean {
  if (!config.enabled) return false

  const now = new Date()
  const currentDay = now.getDay() // 0-6 (Sunday-Saturday)
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  // Check if today is a preferred posting day
  if (config.preferredDays.length > 0 && !config.preferredDays.includes(currentDay)) {
    return false
  }

  // Check if it's past the preferred posting time
  if (currentTime < config.preferredTime) {
    return false
  }

  // Get the last published post
  const lastPost = config.posts?.find(p => p.publishedAt !== null)
  if (!lastPost?.publishedAt) {
    return true // No posts yet, should post
  }

  const lastPostDate = new Date(lastPost.publishedAt)
  const daysSinceLastPost = Math.floor((now.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24))

  // Check based on frequency
  switch (config.frequency) {
    case 'DAILY':
      return daysSinceLastPost >= 1
    case 'TWICE_WEEKLY':
      return daysSinceLastPost >= 3
    case 'WEEKLY':
      return daysSinceLastPost >= 7
    case 'BIWEEKLY':
      return daysSinceLastPost >= 14
    case 'MONTHLY':
      return daysSinceLastPost >= 28
    default:
      return daysSinceLastPost >= 7
  }
}

/**
 * Get all clients due for GBP posting
 */
export async function getClientsDueForPosting(): Promise<(GBPPostConfig & { client: Client })[]> {
  const configs = await prisma.gBPPostConfig.findMany({
    where: {
      enabled: true,
    },
    include: {
      client: true,
      posts: {
        orderBy: { publishedAt: 'desc' },
        take: 1,
        where: { publishedAt: { not: null } },
      },
    },
  })

  return configs.filter(config => isClientDueForPosting(config))
}
