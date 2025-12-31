// AutoContent API Integration for Podcast Generation
// API Docs: https://api.autocontentapi.com

interface PodcastGenerationParams {
  script: string
  title: string
  blogUrl?: string
  duration?: 'short' | 'medium' | 'long'
}

interface PodcastResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  audioUrl?: string
  duration?: number
}

export async function createPodcast(params: PodcastGenerationParams): Promise<PodcastResult> {
  const apiKey = process.env.AUTOCONTENT_API_KEY
  if (!apiKey) {
    throw new Error('AUTOCONTENT_API_KEY is not configured')
  }

  // Use the correct API endpoint from docs: https://api.autocontentapi.com/content/create
  const response = await fetch('https://api.autocontentapi.com/content/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resources: params.blogUrl ? [{ type: 'website', content: params.blogUrl }] : [],
      outputType: 'audio',
      text: params.script,
      duration: params.duration || 'long', // 'long' for 3-5 min podcasts
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AutoContent API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.request_id,
    status: 'pending',
  }
}

export async function checkPodcastStatus(jobId: string): Promise<PodcastResult> {
  const apiKey = process.env.AUTOCONTENT_API_KEY
  if (!apiKey) {
    throw new Error('AUTOCONTENT_API_KEY is not configured')
  }

  // Status endpoint: /content/Status/{request_id} (note: capital S)
  const response = await fetch(`https://api.autocontentapi.com/content/Status/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AutoContent API error: ${error}`)
  }

  const data = await response.json()

  // Status codes from API docs: 0=Pending, 5=Processing, 100=Completed
  let status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending'
  if (data.status === 0) status = 'pending'
  if (data.status === 5) status = 'processing'
  if (data.status === 100) status = 'completed'
  if (data.status < 0) status = 'failed'

  return {
    jobId,
    status,
    audioUrl: data.audio_url,
    duration: data.duration,
  }
}

export async function waitForPodcast(jobId: string, maxAttempts = 30): Promise<PodcastResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await checkPodcastStatus(jobId)

    if (result.status === 'completed') {
      return result
    }

    if (result.status === 'failed') {
      throw new Error('Podcast generation failed')
    }

    // Wait 10 seconds before checking again (as per API docs)
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  throw new Error('Podcast generation timed out')
}
