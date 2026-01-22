// Creatify API Integration for Short Video Generation
// Docs: https://docs.creatify.ai/api-reference/introduction
// API uses X-API-ID and X-API-KEY headers
//
// Uses URL-to-Video API (Link to Videos) to generate videos from blog URLs
// Supports video_length parameter (15, 30, 45, 60 seconds)
// Costs 4 credits per 30s video

// Types for Link to Videos API (exported for use in other modules)
export type AspectRatio = '16x9' | '9x16' | '1x1'
export type VideoLength = 15 | 30 | 45 | 60

// Script styles - see https://docs.creatify.ai for full list
export type ScriptStyle =
  | 'DiscoveryWriter' | 'HowToV2' | 'ProblemSolutionV2' | 'BenefitsV2' | 'CallToActionV2'
  | 'ThreeReasonsWriter' | 'BrandStoryV2' | 'DontWorryWriter' | 'EmotionalWriter'
  | 'GenzWriter' | 'LetMeShowYouWriter' | 'MotivationalWriter' | 'ProblemSolutionWriter'
  | 'ProductHighlightsV2' | 'ProductLifestyleV2' | 'ResponseBubbleWriter'
  | 'SpecialOffersV2' | 'StoryTimeWriter' | 'TrendingTopicsV2' | 'DIY'
  // Hook styles
  | 'NegativeHook' | 'NumberOneHook' | 'EverWonderHook' | 'SecretHook'
  | 'WhatHappensHook' | 'AnyoneElseHook' | 'AmazedHook' | '2025Hook' | 'HateMeHook'

// Visual styles - see https://docs.creatify.ai for full list
export type VisualStyle =
  | 'AvatarBubbleTemplate' | 'DynamicProductTemplate' | 'FullScreenTemplate'
  | 'VanillaTemplate' | 'EnhancedVanillaTemplate' | 'DramaticTemplate'
  | 'DynamicGreenScreenEffect' | 'DynamicResponseBubbleTemplate'
  | 'FeatureHighlightTemplate' | 'FullScreenV2Template' | 'GreenScreenEffectTemplate'
  | 'MotionCardsTemplate' | 'OverCardsTemplate' | 'QuickFrameTemplate'
  | 'QuickTransitionTemplate' | 'ScribbleTemplate' | 'SideBySideTemplate'
  | 'SimpleAvatarOverlayTemplate' | 'TopBottomTemplate' | 'TwitterFrameTemplate'
  | 'VlogTemplate' | 'LegoVisualEmotional' | 'LegoVisualAvatarFocusIntro'

export type ModelVersion = 'standard' | 'aurora_v1' | 'aurora_v1_fast'

interface LinkToVideoParams {
  linkId: string // UUID of the link object
  targetPlatform?: string
  targetAudience?: string
  language?: string
  videoLength?: VideoLength
  aspectRatio?: AspectRatio
  scriptStyle?: ScriptStyle
  visualStyle?: VisualStyle
  webhookUrl?: string
  modelVersion?: ModelVersion // 'standard' is cheapest, aurora models cost more
}

interface VideoGenerationParams {
  title: string
  blogUrl: string // URL to create video from (required)
  imageUrls?: string[]
  logoUrl?: string // Logo URL for branding in video CTA
  aspectRatio?: '16:9' | '9:16' | '1:1'
  duration?: number // seconds (15, 30, 45, or 60)
  targetPlatform?: 'tiktok' | 'youtube' | 'instagram' | 'facebook'
  targetAudience?: string // Description of target audience
  scriptStyle?: ScriptStyle
  visualStyle?: VisualStyle
  webhookUrl?: string
  modelVersion?: ModelVersion
  // Rich description to enhance video script generation
  // This is passed to Creatify's updateLink API to provide context beyond auto-scraped content
  // Should include: PAA question, key services, location, call-to-action, business highlights
  description?: string
}

interface VideoResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  thumbnailUrl?: string
  duration?: number
  failedReason?: string
}

interface LinkResult {
  linkId: string
  url: string
  title?: string
  description?: string
  imageUrls?: string[]
  videoUrls?: string[]
  logoUrl?: string | null
  aiSummary?: string
}

interface UpdateLinkParams {
  linkId: string
  title?: string
  description?: string
  imageUrls?: string[]
  videoUrls?: string[]
  logoUrl?: string
}

// Cache for credentials to avoid repeated DB lookups
let credentialsCache: { apiId: string; apiKey: string } | null = null
let credentialsCacheTime = 0
const CACHE_TTL = 60000 // 1 minute

async function getCredentialsAsync(): Promise<{ apiId: string; apiKey: string }> {
  // Return cached credentials if still valid
  if (credentialsCache && Date.now() - credentialsCacheTime < CACHE_TTL) {
    return credentialsCache
  }

  // Import getSetting to properly handle encrypted database values
  const { getSetting } = await import('@/lib/settings')

  // Try to get from database first (handles decryption automatically)
  let apiKeyRaw = await getSetting('CREATIFY_API_KEY')
  let separateApiId = await getSetting('CREATIFY_API_ID')

  // Fall back to environment variables if not in database
  if (!apiKeyRaw) {
    apiKeyRaw = process.env.CREATIFY_API_KEY || null
  }
  if (!separateApiId) {
    separateApiId = process.env.CREATIFY_API_ID || null
  }

  if (!apiKeyRaw) {
    throw new Error('CREATIFY_API_KEY is not configured')
  }

  let result: { apiId: string; apiKey: string }

  // If we have a separate API ID, use it with the API key
  if (separateApiId) {
    result = { apiId: separateApiId, apiKey: apiKeyRaw }
  }
  // Otherwise, try to parse combined format "api_id:api_key"
  else if (apiKeyRaw.includes(':')) {
    const [apiId, apiKey] = apiKeyRaw.split(':')
    result = { apiId, apiKey }
  }
  else {
    throw new Error(
      'Creatify credentials not configured correctly. Either:\n' +
      '1. Set both CREATIFY_API_ID and CREATIFY_API_KEY separately, or\n' +
      '2. Set CREATIFY_API_KEY in format "api_id:api_key"'
    )
  }

  // Cache the result
  credentialsCache = result
  credentialsCacheTime = Date.now()

  return result
}


/**
 * Create a link object in Creatify from a URL
 * This is required before creating a video from a URL
 * The API automatically scrapes content (images, descriptions, etc.)
 */
export async function createLink(url: string): Promise<LinkResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  const response = await fetch('https://api.creatify.ai/api/links/', {
    method: 'POST',
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error creating link: ${error}`)
  }

  const data = await response.json()
  const link = data.link || {}

  return {
    linkId: data.id,
    url: data.url,
    title: link.title,
    description: link.description,
    imageUrls: link.image_urls,
    videoUrls: link.video_urls,
    logoUrl: link.logo_url,
    aiSummary: link.ai_summary,
  }
}

/**
 * Update a link's metadata before video generation
 * Useful for:
 * - Adding a logo for better branding and CTA
 * - Removing low-quality images/videos
 * - Enhancing or rewriting the description
 * - Highlighting specific features or offers
 */
export async function updateLink(params: UpdateLinkParams): Promise<LinkResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  const requestBody: Record<string, unknown> = {}

  if (params.title) requestBody.title = params.title
  if (params.description) requestBody.description = params.description
  if (params.imageUrls) requestBody.image_urls = params.imageUrls
  if (params.videoUrls) requestBody.video_urls = params.videoUrls
  if (params.logoUrl) requestBody.logo_url = params.logoUrl

  const response = await fetch(`https://api.creatify.ai/api/links/${params.linkId}/`, {
    method: 'PUT',
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error updating link: ${error}`)
  }

  const data = await response.json()

  return {
    linkId: data.id,
    url: data.url,
    title: data.title,
    description: data.description,
    imageUrls: data.image_urls,
    videoUrls: data.video_urls,
    logoUrl: data.logo_url,
    aiSummary: data.ai_summary,
  }
}

/**
 * Create a video from a link using the Link to Videos API
 * This is the PREFERRED method for short videos because it supports video_length parameter
 * Costs 4 credits per 30s video
 */
export async function createVideoFromLink(params: LinkToVideoParams): Promise<VideoResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  const requestBody: Record<string, unknown> = {
    link: params.linkId,
    target_platform: params.targetPlatform || 'tiktok',
    target_audience: params.targetAudience || 'adults interested in auto services',
    language: params.language || 'en',
    video_length: params.videoLength || 30,
    aspect_ratio: params.aspectRatio || '9x16',
    script_style: params.scriptStyle || 'DiscoveryWriter',
    visual_style: params.visualStyle || 'AvatarBubbleTemplate',
  }

  if (params.webhookUrl) {
    requestBody.webhook_url = params.webhookUrl
  }

  if (params.modelVersion) {
    requestBody.model_version = params.modelVersion
  }

  console.log('📹 Creating video via URL-to-Video API:', {
    linkId: params.linkId,
    video_length: requestBody.video_length,
    visual_style: requestBody.visual_style,
    script_style: requestBody.script_style,
    model_version: requestBody.model_version,
  })

  const response = await fetch('https://api.creatify.ai/api/link_to_videos/', {
    method: 'POST',
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify URL-to-Video API error: ${error}`)
  }

  const data = await response.json()

  console.log(`✅ Video job created: ${data.id} (expected duration: ${requestBody.video_length}s)`)

  return {
    jobId: data.id,
    status: 'pending',
  }
}

/**
 * Create a short video using URL-to-Video API
 * This scrapes the blog URL and generates a video from its content
 * Supports video_length parameter (15, 30, 45, 60 seconds)
 * Costs 4 credits per 30s video
 */
export async function createShortVideo(params: VideoGenerationParams): Promise<VideoResult> {
  console.log(`🔗 Creating link from blog URL: ${params.blogUrl}`)

  // First create a link from the URL (auto-scrapes content)
  const link = await createLink(params.blogUrl)

  console.log(`✅ Link created: ${link.linkId}`, {
    title: link.title,
    imageCount: link.imageUrls?.length || 0,
    hasLogo: !!link.logoUrl,
  })

  // Update link metadata if we have custom logo, images, or description
  // The description is KEY - it provides rich context for better video script generation
  if (params.logoUrl || (params.imageUrls && params.imageUrls.length > 0) || params.description) {
    const updateFields: string[] = []
    if (params.logoUrl) updateFields.push('logo')
    if (params.imageUrls?.length) updateFields.push(`${params.imageUrls.length} images`)
    if (params.description) updateFields.push('description')
    console.log(`📝 Updating link with: ${updateFields.join(', ')}`)

    await updateLink({
      linkId: link.linkId,
      logoUrl: params.logoUrl,
      imageUrls: params.imageUrls,
      description: params.description,
    })
  }

  // Map aspect ratio format
  const aspectRatio = params.aspectRatio === '9:16' ? '9x16' :
                      params.aspectRatio === '16:9' ? '16x9' :
                      params.aspectRatio === '1:1' ? '1x1' : '9x16'

  // Map duration to valid video length
  const videoLength = (params.duration && [15, 30, 45, 60].includes(params.duration))
    ? params.duration as VideoLength
    : 30

  // Create video from the link with explicit video_length
  return await createVideoFromLink({
    linkId: link.linkId,
    aspectRatio,
    videoLength,
    targetPlatform: params.targetPlatform || 'tiktok',
    targetAudience: params.targetAudience || 'adults interested in auto services',
    scriptStyle: params.scriptStyle || 'DiscoveryWriter',
    visualStyle: params.visualStyle || 'AvatarBubbleTemplate',
    webhookUrl: params.webhookUrl,
    modelVersion: params.modelVersion || 'standard',
  })
}

/**
 * Check status of a video job
 */
export async function checkVideoStatus(jobId: string): Promise<VideoResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  const response = await fetch(`https://api.creatify.ai/api/link_to_videos/${jobId}/`, {
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error: ${error}`)
  }

  const data = await response.json()

  // Map Creatify status to our status
  // Creatify statuses: pending, in_queue, running, failed, done
  let status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending'
  if (data.status === 'pending' || data.status === 'queued' || data.status === 'in_queue') {
    status = 'pending'
  } else if (data.status === 'processing' || data.status === 'running') {
    status = 'processing'
  } else if (data.status === 'done' || data.status === 'completed') {
    status = 'completed'
  } else if (data.status === 'failed' || data.status === 'error' || data.status === 'rejected') {
    status = 'failed'
  }

  // SAFEGUARD: Warn if video duration exceeds 30 seconds (short-form should be ~30s)
  if (status === 'completed' && data.duration && data.duration > 45) {
    console.error(`🚨 VIDEO TOO LONG: Duration is ${data.duration} seconds (expected ~30s). JobId: ${jobId}`)
    console.error(`This wastes credits! Check the template configuration in Creatify dashboard.`)
  }

  return {
    jobId: data.id,
    status,
    videoUrl: data.video_output || data.output || data.video_url,
    thumbnailUrl: data.video_thumbnail || data.thumbnail_url,
    duration: data.duration,
    failedReason: data.failed_reason,
  }
}

export async function waitForVideo(jobId: string, maxAttempts = 60): Promise<VideoResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await checkVideoStatus(jobId)

    if (result.status === 'completed') {
      return result
    }

    if (result.status === 'failed') {
      throw new Error(`Video generation failed: ${result.failedReason || 'Unknown error'}`)
    }

    // Wait 15 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 15000))
  }

  throw new Error('Video generation timed out')
}

// Placeholder for Pictory integration (future)
export async function createLongVideo(): Promise<VideoResult> {
  throw new Error('Pictory integration not yet available')
}
