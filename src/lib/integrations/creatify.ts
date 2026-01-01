// Creatify API Integration for Short Video Generation
// Docs: https://docs.creatify.ai/api-reference/introduction
// API uses X-API-ID and X-API-KEY headers

interface VideoGenerationParams {
  script: string
  title: string
  imageUrls: string[]
  aspectRatio?: '16:9' | '9:16' | '1:1'
  duration?: number // seconds
}

interface VideoResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  thumbnailUrl?: string
  duration?: number
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

export async function createShortVideo(params: VideoGenerationParams): Promise<VideoResult> {
  const { apiId, apiKey } = getCredentials()

  // Use AI Shorts or Lipsync v2 endpoint for video generation
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
      // Creatify-specific parameters
      creator: 'maya', // Default avatar
      style: 'video_editing',
      caption: true,
      caption_style: 'default',
      // Add images as b-roll if provided
      ...(params.imageUrls.length > 0 && {
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

export async function checkVideoStatus(jobId: string): Promise<VideoResult> {
  const { apiId, apiKey } = getCredentials()

  const response = await fetch(`https://api.creatify.ai/api/lipsyncs_v2/${jobId}/`, {
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
  let status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending'
  if (data.status === 'pending' || data.status === 'queued') status = 'pending'
  if (data.status === 'processing' || data.status === 'running') status = 'processing'
  if (data.status === 'done' || data.status === 'completed') status = 'completed'
  if (data.status === 'failed' || data.status === 'error') status = 'failed'

  return {
    jobId: data.id,
    status,
    videoUrl: data.output || data.video_url,
    thumbnailUrl: data.thumbnail_url,
    duration: data.duration,
  }
}

export async function waitForVideo(jobId: string, maxAttempts = 60): Promise<VideoResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await checkVideoStatus(jobId)

    if (result.status === 'completed') {
      return result
    }

    if (result.status === 'failed') {
      throw new Error('Video generation failed')
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
