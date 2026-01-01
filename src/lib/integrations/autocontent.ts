// AutoContent API Integration for Podcast Generation
// API Docs: https://docs.autocontentapi.com/quick-start/podcasts/create-podcast-episode

import { getSetting } from '../settings'

interface PodcastGenerationParams {
  script: string
  title: string
  blogUrl?: string
  duration?: 'short' | 'default' | 'long'
}

interface PodcastResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  audioUrl?: string
  duration?: number
}

export async function createPodcast(params: PodcastGenerationParams): Promise<PodcastResult> {
  const apiKey = await getSetting('AUTOCONTENT_API_KEY')
  if (!apiKey) {
    throw new Error('AUTOCONTENT_API_KEY is not configured')
  }

  // Build resources array - use blog URL if available, otherwise use script as text
  const resources: Array<{ type: string; content: string }> = []

  if (params.blogUrl) {
    resources.push({ type: 'website', content: params.blogUrl })
  } else if (params.script) {
    // Use the script/blog content as a text resource
    resources.push({ type: 'text', content: params.script })
  }

  if (resources.length === 0) {
    throw new Error('No content provided for podcast generation')
  }

  // Use the correct API endpoint from docs
  const response = await fetch('https://api.autocontentapi.com/content/Create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resources,
      outputType: 'audio',
      text: `Create an engaging podcast episode titled "${params.title}". Make it conversational and informative.`,
      duration: params.duration || 'long',
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
  const apiKey = await getSetting('AUTOCONTENT_API_KEY')
  if (!apiKey) {
    throw new Error('AUTOCONTENT_API_KEY is not configured')
  }

  // Status endpoint: /content/Status/{request_id}
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
