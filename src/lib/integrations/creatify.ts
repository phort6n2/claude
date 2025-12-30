// Creatify API Integration for Short Video Generation

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

export async function createShortVideo(params: VideoGenerationParams): Promise<VideoResult> {
  const apiKey = process.env.CREATIFY_API_KEY
  if (!apiKey) {
    throw new Error('CREATIFY_API_KEY is not configured')
  }

  const response = await fetch('https://api.creatify.ai/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: params.script,
      title: params.title,
      media: params.imageUrls.map(url => ({ type: 'image', url })),
      aspect_ratio: params.aspectRatio || '9:16',
      duration: params.duration || 60,
      style: 'professional',
      music: 'upbeat',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.job_id,
    status: 'pending',
  }
}

export async function checkVideoStatus(jobId: string): Promise<VideoResult> {
  const apiKey = process.env.CREATIFY_API_KEY
  if (!apiKey) {
    throw new Error('CREATIFY_API_KEY is not configured')
  }

  const response = await fetch(`https://api.creatify.ai/v1/videos/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Creatify API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.job_id,
    status: data.status,
    videoUrl: data.video_url,
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
