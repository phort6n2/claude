// AutoContent API Integration for Podcast Generation

interface PodcastGenerationParams {
  script: string
  title: string
  length?: 'short' | 'medium' | 'long'
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

  const response = await fetch('https://api.autocontent.ai/v1/podcasts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: params.script,
      title: params.title,
      length: params.length || 'short',
      voice: 'default',
      format: 'mp3',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AutoContent API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.job_id,
    status: 'pending',
  }
}

export async function checkPodcastStatus(jobId: string): Promise<PodcastResult> {
  const apiKey = process.env.AUTOCONTENT_API_KEY
  if (!apiKey) {
    throw new Error('AUTOCONTENT_API_KEY is not configured')
  }

  const response = await fetch(`https://api.autocontent.ai/v1/podcasts/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AutoContent API error: ${error}`)
  }

  const data = await response.json()

  return {
    jobId: data.job_id,
    status: data.status,
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

    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  throw new Error('Podcast generation timed out')
}
