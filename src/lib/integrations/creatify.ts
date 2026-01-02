// Creatify API Integration for Short Video Generation
// Docs: https://docs.creatify.ai/api-reference/introduction
// API uses X-API-ID and X-API-KEY headers
//
// Three methods available:
// 1. Custom Template - Use pre-built templates with variable substitution (most control)
// 2. Link to Videos - Generate from a blog URL (automatic, good quality)
// 3. Lipsync - Generate from script text (fallback)

// Types for Link to Videos API
type AspectRatio = '16x9' | '9x16' | '1x1'
type VideoLength = 15 | 30 | 45 | 60
type ScriptStyle = 'DiscoveryWriter' | 'HowToV2' | 'ProblemSolutionV2' | 'BenefitsV2' | 'CallToActionV2' | 'ThreeReasonsWriter'
type VisualStyle = 'AvatarBubbleTemplate' | 'DynamicProductTemplate' | 'FullScreenTemplate' | 'VanillaTemplate' | 'EnhancedVanillaTemplate'
type ModelVersion = 'standard' | 'aurora_v1' | 'aurora_v1_fast'

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
}

interface VideoGenerationParams {
  script?: string
  title: string
  blogUrl?: string // URL to create video from
  templateId?: string // Custom template UUID (takes priority if provided)
  templateVariables?: Record<string, TemplateVariable> // Variables for custom template
  imageUrls?: string[]
  aspectRatio?: '16:9' | '9:16' | '1:1'
  duration?: number // seconds (15, 30, 45, or 60)
  targetPlatform?: 'tiktok' | 'youtube' | 'instagram' | 'facebook'
  scriptStyle?: ScriptStyle
  visualStyle?: VisualStyle
  webhookUrl?: string
  modelVersion?: ModelVersion
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
}

function getCredentials(): { apiId: string; apiKey: string } {
  const apiKeyRaw = process.env.CREATIFY_API_KEY
  if (!apiKeyRaw) {
    throw new Error('CREATIFY_API_KEY is not configured')
  }

  // API key format: "api_id:api_key"
  const [apiId, apiKey] = apiKeyRaw.includes(':') ? apiKeyRaw.split(':') : [apiKeyRaw, '']

  if (!apiKey) {
    throw new Error('CREATIFY_API_KEY should be in format "api_id:api_key"')
  }

  return { apiId, apiKey }
}

/**
 * Create a link object in Creatify from a URL
 * This is required before creating a video from a URL
 */
export async function createLink(url: string): Promise<LinkResult> {
  const { apiId, apiKey } = getCredentials()

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

  return {
    linkId: data.id,
    url: data.url,
  }
}

/**
 * Create a video from a custom template
 * Templates are created in the Creatify dashboard and have variable placeholders
 */
export async function createVideoFromTemplate(params: CustomTemplateParams): Promise<VideoResult> {
  const { apiId, apiKey } = getCredentials()

  const requestBody: Record<string, unknown> = {
    template: params.templateId,
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

  return {
    jobId: data.id,
    status: 'pending',
  }
}

/**
 * Create a video from a link using the Link to Videos API
 */
export async function createVideoFromLink(params: LinkToVideoParams): Promise<VideoResult> {
  const { apiId, apiKey } = getCredentials()

  const requestBody: Record<string, unknown> = {
    link: params.linkId,
    target_platform: params.targetPlatform || 'tiktok',
    target_audience: params.targetAudience || 'adults interested in auto services',
    language: params.language || 'en',
    video_length: params.videoLength || 30,
    aspect_ratio: params.aspectRatio || '9x16',
    script_style: params.scriptStyle || 'HowToV2',
    visual_style: params.visualStyle || 'AvatarBubbleTemplate',
  }

  if (params.webhookUrl) {
    requestBody.webhook_url = params.webhookUrl
  }

  if (params.overrideScript) {
    requestBody.override_script = params.overrideScript
  }

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
    throw new Error(`Creatify API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.id,
    status: 'pending',
  }
}

/**
 * Create a short video - main entry point
 * Priority order:
 * 1. Custom Template (if templateId provided) - most control
 * 2. Link to Videos (if blogUrl provided) - automatic, good quality
 * 3. Lipsync (if script provided) - fallback
 */
export async function createShortVideo(params: VideoGenerationParams): Promise<VideoResult> {
  const { apiId, apiKey } = getCredentials()

  // Priority 1: If we have a template, use the Custom Template API
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

  // Priority 2: If we have a blog URL, use the Link to Videos API
  if (params.blogUrl) {
    try {
      // First create a link from the URL
      const link = await createLink(params.blogUrl)

      // Map aspect ratio format
      const aspectRatio = params.aspectRatio === '9:16' ? '9x16' :
                          params.aspectRatio === '16:9' ? '16x9' :
                          params.aspectRatio === '1:1' ? '1x1' : '9x16'

      // Map duration to valid video length
      const videoLength = (params.duration && [15, 30, 45, 60].includes(params.duration))
        ? params.duration as VideoLength
        : 30

      // Create video from the link
      return await createVideoFromLink({
        linkId: link.linkId,
        aspectRatio,
        videoLength,
        targetPlatform: params.targetPlatform || 'tiktok',
        scriptStyle: params.scriptStyle || 'HowToV2',
        visualStyle: params.visualStyle || 'AvatarBubbleTemplate',
        webhookUrl: params.webhookUrl,
        overrideScript: params.script, // Use provided script as override if any
      })
    } catch (error) {
      console.error('Link to Videos API failed, falling back to lipsync:', error)
      // Fall through to lipsync method
    }
  }

  // Fallback: Use lipsync v2 endpoint with script
  if (!params.script) {
    throw new Error('Either blogUrl or script is required for video generation')
  }

  const response = await fetch('https://api.creatify.ai/api/lipsyncs_v2/', {
    method: 'POST',
    headers: {
      'X-API-ID': apiId,
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: params.script,
      aspect_ratio: params.aspectRatio || '9:16',
      creator: 'maya',
      style: 'video_editing',
      caption: true,
      caption_style: 'default',
      ...(params.imageUrls && params.imageUrls.length > 0 && {
        b_roll_media: params.imageUrls.map(url => ({ url, type: 'image' })),
      }),
    }),
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
  const { apiId, apiKey } = getCredentials()

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
