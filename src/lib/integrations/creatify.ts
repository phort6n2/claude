// Creatify API Integration for Short Video Generation
// Docs: https://docs.creatify.ai/api-reference/introduction
// API uses X-API-ID and X-API-KEY headers
//
// Three methods available:
// 1. Custom Template - Use pre-built templates with variable substitution (most control)
// 2. Link to Videos - Generate from a blog URL (automatic, good quality)
// 3. Lipsync - Generate from script text (fallback)

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

// Types for Custom Template API
type VariableType = 'image' | 'video' | 'audio' | 'text' | 'avatar' | 'voiceover'

interface TemplateVariable {
  type: VariableType
  properties: {
    url?: string       // For image, video, audio
    content?: string   // For text
    avatar_id?: string // For avatar
    voice_id?: string  // For voiceover
  }
}

interface CustomTemplateParams {
  templateId: string  // UUID of the custom template
  variables: Record<string, TemplateVariable>
  name?: string
  webhookUrl?: string
  modelVersion?: ModelVersion
}

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
  overrideScript?: string
  noCta?: boolean // Disable default CTA button
  modelVersion?: ModelVersion // 'standard' is cheapest, aurora models cost more
}

interface VideoGenerationParams {
  script?: string
  title: string
  blogUrl?: string // URL to create video from
  templateId?: string // Custom template UUID
  templateVariables?: Record<string, TemplateVariable> // Explicit variables for custom template
  autoPopulateFromBlog?: boolean // If true and both templateId + blogUrl provided, scrape blog for template variables
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
  noCta?: boolean // Disable default CTA button (rely on script for CTA instead)
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

// Synchronous version for backwards compatibility - uses cached value or env vars
function getCredentials(): { apiId: string; apiKey: string } {
  // Return cached credentials if available
  if (credentialsCache && Date.now() - credentialsCacheTime < CACHE_TTL) {
    return credentialsCache
  }

  // Fall back to environment variables for sync calls
  const separateApiId = process.env.CREATIFY_API_ID
  const apiKeyRaw = process.env.CREATIFY_API_KEY

  if (!apiKeyRaw) {
    throw new Error('CREATIFY_API_KEY is not configured. Call getCredentialsAsync() first or set env vars.')
  }

  if (separateApiId) {
    return { apiId: separateApiId, apiKey: apiKeyRaw }
  }

  if (apiKeyRaw.includes(':')) {
    const [apiId, apiKey] = apiKeyRaw.split(':')
    return { apiId, apiKey }
  }

  throw new Error(
    'Creatify credentials not configured correctly. Either:\n' +
    '1. Set both CREATIFY_API_ID and CREATIFY_API_KEY separately, or\n' +
    '2. Set CREATIFY_API_KEY in format "api_id:api_key"'
  )
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
 * Create a video from a custom template
 * Templates are created in the Creatify dashboard and have variable placeholders
 *
 * IMPORTANT: The custom_template_jobs API does NOT accept a video_length parameter.
 * The video duration is determined by the template configuration in Creatify.
 * Make sure your template is configured for 30 seconds in the Creatify dashboard.
 */
export async function createVideoFromTemplate(params: CustomTemplateParams): Promise<VideoResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  // Note: template_id is the correct field name per API docs
  // video_length is NOT supported for custom templates - duration is set in the template
  const requestBody: Record<string, unknown> = {
    template_id: params.templateId,
    variables: params.variables,
  }

  if (params.name) {
    requestBody.name = params.name
  }

  if (params.webhookUrl) {
    requestBody.webhook_url = params.webhookUrl
  }

  if (params.modelVersion) {
    requestBody.model_version = params.modelVersion
  }

  console.log('Creating custom template video with:', {
    template_id: params.templateId,
    variableKeys: Object.keys(params.variables || {}),
  })

  const response = await fetch('https://api.creatify.ai/api/custom_template_jobs/', {
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
    throw new Error(`Creatify Custom Template API error: ${error}`)
  }

  const data = await response.json()

  // Log duration warning if video is longer than expected
  if (data.duration && data.duration > 45) {
    console.warn(`WARNING: Custom template video duration is ${data.duration} seconds. Expected ~30 seconds. Check template configuration in Creatify dashboard.`)
  }

  return {
    jobId: data.id,
    status: 'pending',
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

  if (params.overrideScript) {
    requestBody.override_script = params.overrideScript
  }

  if (params.modelVersion) {
    requestBody.model_version = params.modelVersion
  }

  // Disable default CTA if specified
  if (params.noCta) {
    requestBody.no_cta = true
  }

  console.log('📹 Creating video via URL-to-Video API:', {
    linkId: params.linkId,
    video_length: requestBody.video_length,
    visual_style: requestBody.visual_style,
    script_style: requestBody.script_style,
    model_version: requestBody.model_version,
    no_cta: requestBody.no_cta || false,
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
 * Create a short video - main entry point
 *
 * RECOMMENDED: Use URL-to-Video API (Link to Videos) for reliable video_length control
 *
 * Priority order:
 * 1. Custom Template + Blog URL (hybrid) - DISABLED: doesn't support video_length
 * 2. Custom Template with explicit variables - DISABLED: doesn't support video_length
 * 3. Link to Videos (if blogUrl provided) - PREFERRED: supports video_length (15, 30, 45, 60)
 * 4. Lipsync (if script provided) - fallback with script length limit
 */
export async function createShortVideo(params: VideoGenerationParams): Promise<VideoResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  // Priority 1: Hybrid approach - Custom Template with blog content
  // Use this when you want custom CTA (like "Call Now") but content from blog
  if (params.templateId && params.blogUrl && params.autoPopulateFromBlog) {
    try {
      // Scrape blog URL to get content
      const blogContent = await createLink(params.blogUrl)

      // Build template variables from blog content
      // These are common variable names - adjust based on your template
      const autoVariables: Record<string, TemplateVariable> = {}

      // Add title as text variable
      if (blogContent.title) {
        autoVariables['title'] = {
          type: 'text',
          properties: { content: blogContent.title }
        }
        autoVariables['headline'] = {
          type: 'text',
          properties: { content: blogContent.title }
        }
      }

      // Add description/summary as text variable
      if (blogContent.aiSummary || blogContent.description) {
        autoVariables['description'] = {
          type: 'text',
          properties: { content: blogContent.aiSummary || blogContent.description }
        }
        autoVariables['script'] = {
          type: 'text',
          properties: { content: blogContent.aiSummary || blogContent.description }
        }
      }

      // Add first image as image variable
      if (blogContent.imageUrls && blogContent.imageUrls.length > 0) {
        autoVariables['image'] = {
          type: 'image',
          properties: { url: blogContent.imageUrls[0] }
        }
        autoVariables['product_image'] = {
          type: 'image',
          properties: { url: blogContent.imageUrls[0] }
        }
        autoVariables['background'] = {
          type: 'image',
          properties: { url: blogContent.imageUrls[0] }
        }
      }

      // Add logo if provided
      if (params.logoUrl) {
        autoVariables['logo'] = {
          type: 'image',
          properties: { url: params.logoUrl }
        }
      }

      // Merge auto-populated variables with any explicit overrides
      const finalVariables = {
        ...autoVariables,
        ...(params.templateVariables || {}),
      }

      return await createVideoFromTemplate({
        templateId: params.templateId,
        variables: finalVariables,
        name: params.title,
        webhookUrl: params.webhookUrl,
        modelVersion: params.modelVersion,
      })
    } catch (error) {
      console.error('Hybrid Template+Blog approach failed, falling back to Link to Videos:', error)
      // Fall through to blog URL method
    }
  }

  // Priority 2: Custom Template with explicit variables
  if (params.templateId && params.templateVariables) {
    try {
      return await createVideoFromTemplate({
        templateId: params.templateId,
        variables: params.templateVariables,
        name: params.title,
        webhookUrl: params.webhookUrl,
        modelVersion: params.modelVersion,
      })
    } catch (error) {
      console.error('Custom Template API failed, falling back to Link to Videos:', error)
      // Fall through to blog URL method
    }
  }

  // Priority 3 (PREFERRED): Use the URL-to-Video API with video_length parameter
  if (params.blogUrl) {
    try {
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
        overrideScript: params.script,
        noCta: params.noCta,
        modelVersion: params.modelVersion || 'standard',
      })
    } catch (error) {
      console.error('Link to Videos API failed, falling back to lipsync:', error)
      // Fall through to lipsync method
    }
  }

  // Priority 4 (Fallback): Use lipsync v2 endpoint with script
  // WARNING: Lipsync does NOT have a video_length parameter!
  // The script length determines the video duration.
  // ~500 characters = ~75 words = ~30 seconds at 150 words per minute
  if (!params.script) {
    throw new Error('Either blogUrl or script is required for video generation')
  }

  // SAFEGUARD: Limit script to ~500 chars to ensure ~30 second videos
  // This prevents accidentally creating 3+ minute videos that waste credits
  const maxScriptLength = params.duration ? params.duration * 17 : 500 // ~17 chars per second
  const limitedScript = params.script.substring(0, maxScriptLength)

  if (params.script.length > maxScriptLength) {
    console.warn(`⚠️ LIPSYNC SCRIPT TRUNCATED: Original ${params.script.length} chars, limited to ${maxScriptLength} chars for ~${params.duration || 30}s video`)
  }

  console.log(`Creating lipsync video with script length: ${limitedScript.length} chars (target: ~${params.duration || 30}s)`)

  const lipsyncBody: Record<string, unknown> = {
    script: limitedScript,
    aspect_ratio: params.aspectRatio || '9:16',
    style: 'video_editing',
    caption: true,
    caption_style: 'default',
  }

  // Add b-roll media if provided
  if (params.imageUrls && params.imageUrls.length > 0) {
    lipsyncBody.b_roll_media = params.imageUrls.map(url => ({ url, type: 'image' }))
  }

  const response = await fetch('https://api.creatify.ai/api/lipsyncs_v2/', {
    method: 'POST',
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lipsyncBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.id || data.task_id,
    status: 'pending',
  }
}

/**
 * Check status of a video job
 * Works for custom_template_jobs, link_to_videos, and lipsyncs endpoints
 */
export async function checkVideoStatus(jobId: string): Promise<VideoResult> {
  const { apiId, apiKey } = await getCredentialsAsync()

  // Try custom_template_jobs endpoint first
  let response = await fetch(`https://api.creatify.ai/api/custom_template_jobs/${jobId}/`, {
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
    },
  })

  // If not found, try link_to_videos endpoint
  if (response.status === 404) {
    response = await fetch(`https://api.creatify.ai/api/link_to_videos/${jobId}/`, {
      headers: {
        'X-API-ID': apiId,
        'X-API-KEY': apiKey,
      },
    })
  }

  // If not found, try lipsyncs endpoint
  if (response.status === 404) {
    response = await fetch(`https://api.creatify.ai/api/lipsyncs_v2/${jobId}/`, {
      headers: {
        'X-API-ID': apiId,
        'X-API-KEY': apiKey,
      },
    })
  }

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
