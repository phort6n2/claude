// getlate.dev API Integration for Social Media Scheduling

import { getSetting } from '@/lib/settings'

type Platform = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram'

// Helper to get Late API key from environment or settings
async function getLateApiKey(): Promise<string | null> {
  return process.env.GETLATE_API_KEY ||
    await getSetting('GETLATE_API_KEY') ||
    await getSetting('LATE_API_KEY')
}

// Map our internal platform names to Late API platform names
const LATE_PLATFORM_MAP: Record<Platform, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  twitter: 'twitter',  // Late may also accept 'x'
  tiktok: 'tiktok',
  gbp: 'googlebusiness',  // Late uses 'googlebusiness' not 'gbp'
  youtube: 'youtube',
  bluesky: 'bluesky',
  threads: 'threads',
  reddit: 'reddit',
  pinterest: 'pinterest',
  telegram: 'telegram',
}

function getLatePlatform(platform: Platform): string {
  return LATE_PLATFORM_MAP[platform] || platform
}

interface SchedulePostParams {
  accountId: string
  platform: Platform
  caption: string
  hashtags?: string[]
  mediaUrls?: string[]
  mediaType?: 'image' | 'video'
  scheduledTime: Date
  firstComment?: string
  ctaUrl?: string  // For GBP "Learn More" button - links to the blog post
}

interface ScheduledPostResult {
  postId: string
  platform: Platform
  scheduledTime: Date
  status: 'scheduled' | 'published' | 'failed' | 'processing'
  platformPostUrl?: string  // URL to view the post on the social platform
  error?: string  // Error message if status is 'failed'
}

export async function schedulePost(params: SchedulePostParams): Promise<ScheduledPostResult> {
  const apiKey = await getLateApiKey()
  if (!apiKey) {
    throw new Error('GETLATE_API_KEY is not configured. Add it to Settings > API Keys.')
  }

  // Format caption with hashtags for platforms that use them
  let fullCaption = params.caption
  if (params.hashtags && params.hashtags.length > 0) {
    const hashtagsText = params.hashtags.map(h => `#${h}`).join(' ')
    fullCaption = `${params.caption}\n\n${hashtagsText}`
  }

  // Build platform-specific data object
  // According to Late docs, platformSpecificData goes INSIDE each platform object
  const platformSpecificData: Record<string, unknown> = {}

  // Add first comment for platforms that support it (Facebook, Instagram, etc.)
  if (params.firstComment) {
    platformSpecificData.firstComment = params.firstComment
  }

  // Add GBP-specific "Learn More" call-to-action button
  if (params.platform === 'gbp' && params.ctaUrl) {
    platformSpecificData.callToAction = {
      type: 'LEARN_MORE',
      url: params.ctaUrl,
    }
  }

  // Build the platform object with platformSpecificData inside it
  const latePlatform = getLatePlatform(params.platform)
  const platformObj: Record<string, unknown> = {
    platform: latePlatform,
    accountId: params.accountId,
  }

  // Only add platformSpecificData if we have any
  if (Object.keys(platformSpecificData).length > 0) {
    platformObj.platformSpecificData = platformSpecificData
  }

  // Build request body according to Late API docs
  const requestBody: Record<string, unknown> = {
    content: fullCaption,
    platforms: [platformObj],
  }

  // Add media if provided
  if (params.mediaUrls && params.mediaUrls.length > 0) {
    requestBody.mediaItems = params.mediaUrls.map(url => ({
      type: params.mediaType || 'image',
      url,
    }))
  }

  // Check if posting immediately (scheduled time is within 1 minute of now)
  const now = new Date()
  const isImmediate = Math.abs(params.scheduledTime.getTime() - now.getTime()) < 60000

  if (isImmediate) {
    requestBody.publishNow = true
  } else {
    requestBody.scheduledFor = params.scheduledTime.toISOString()
  }

  console.log('Late API request:', JSON.stringify(requestBody, null, 2))

  const response = await fetch('https://getlate.dev/api/v1/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`getlate API error: ${error}`)
  }

  const data = await response.json()
  console.log('Late API response:', JSON.stringify(data, null, 2))

  // Late API returns: { message: "...", post: { _id: "...", platforms: [...], ... } }
  const post = data.post
  if (!post || !post._id) {
    console.error('Late API response missing post or post._id:', data)
    throw new Error('Late API response did not include a post ID')
  }

  // Get platform-specific URL from platforms array
  const platformData = post.platforms?.[0]

  return {
    postId: post._id,
    platform: params.platform,
    scheduledTime: new Date(post.scheduledFor || params.scheduledTime),
    status: post.status || (isImmediate ? 'published' : 'scheduled'),
    platformPostUrl: platformData?.platformPostUrl || null,
  }
}

// Post immediately by setting scheduled time to now
export async function postNow(params: Omit<SchedulePostParams, 'scheduledTime'>): Promise<ScheduledPostResult> {
  return schedulePost({
    ...params,
    scheduledTime: new Date(), // Post immediately
  })
}

export async function checkPostStatus(postId: string): Promise<ScheduledPostResult> {
  const apiKey = await getLateApiKey()
  if (!apiKey) {
    throw new Error('GETLATE_API_KEY is not configured. Add it to Settings > API Keys.')
  }

  const response = await fetch(`https://getlate.dev/api/v1/posts/${postId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`getlate API error: ${error}`)
  }

  const data = await response.json()
  console.log('Late API status check response:', JSON.stringify(data, null, 2))

  // Late wraps the post in a "post" object
  const post = data.post || data

  // Extract platform from platforms array
  const platformData = post.platforms?.[0]

  // Log all the fields we're checking to help debug
  console.log('Late status parsing:', {
    'post.status': post.status,
    'platformData?.status': platformData?.status,
    'platformData?.platformPostUrl': platformData?.platformPostUrl,
  })

  // Normalize status - check platform-specific status first, then post-level status
  // Platform statuses: "pending", "published", "failed"
  // Post statuses: "draft", "scheduled", "published", "failed"
  let status: 'scheduled' | 'published' | 'failed' | 'processing' = 'processing'
  const platformStatus = (platformData?.status || '').toLowerCase()
  const postStatus = (post.status || '').toLowerCase()

  // Check platform-specific status first (more accurate)
  if (platformStatus === 'published') {
    status = 'published'
  } else if (platformStatus === 'failed') {
    status = 'failed'
  } else if (platformStatus === 'pending') {
    // Pending means waiting to be published
    status = postStatus === 'scheduled' ? 'scheduled' : 'processing'
  } else {
    // Fallback to post-level status
    if (postStatus === 'published') {
      status = 'published'
    } else if (postStatus === 'failed') {
      status = 'failed'
    } else if (postStatus === 'scheduled') {
      status = 'scheduled'
    }
  }

  // Get error message if present
  const error = platformData?.error || platformData?.errorMessage || post.error || post.errorMessage

  // Get the platform post URL (only available when published)
  const platformPostUrl = platformData?.platformPostUrl

  console.log('Late status result:', { status, platformPostUrl, error })

  return {
    postId: post._id || post.id || postId,
    platform: platformData?.platform || post.platform,
    scheduledTime: new Date(post.scheduledFor || post.publishedAt || Date.now()),
    status,
    platformPostUrl,
    error,
  }
}

/**
 * Post immediately and poll for status to detect platform errors
 * Polls up to 3 times with 2-second intervals
 */
export async function postNowAndCheckStatus(
  params: Omit<SchedulePostParams, 'scheduledTime'>
): Promise<ScheduledPostResult> {
  // First, submit the post
  const initialResult = await postNow(params)

  // If we got a platform URL immediately, it's definitely published
  if (initialResult.platformPostUrl) {
    return { ...initialResult, status: 'published' }
  }

  // Poll for status to check if it succeeded or failed
  const maxAttempts = 3
  const pollInterval = 2000 // 2 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))

    try {
      const statusResult = await checkPostStatus(initialResult.postId)
      console.log(`Status check attempt ${attempt}:`, statusResult.status, statusResult.error || '')

      // If we have a definitive status (published or failed), return it
      if (statusResult.status === 'published' || statusResult.status === 'failed') {
        return statusResult
      }

      // If still processing, continue polling
    } catch (error) {
      console.error(`Status check attempt ${attempt} failed:`, error)
    }
  }

  // After polling, still processing - return as processing
  return { ...initialResult, status: 'processing' }
}

export async function scheduleSocialPosts(params: {
  accountIds: Record<string, string>  // Per-platform account IDs
  platforms: Platform[]
  captions: Record<Platform, { caption: string; hashtags: string[]; firstComment: string }>
  mediaUrls: string[]
  mediaType: 'image' | 'video'
  baseTime: Date
}): Promise<ScheduledPostResult[]> {
  const results: ScheduledPostResult[] = []

  // Stagger posts across platforms
  const staggerMinutes: Record<Platform, number> = {
    twitter: 0,        // First
    bluesky: 15,       // +15 min
    threads: 30,       // +30 min
    facebook: 60,      // +1 hour
    linkedin: 120,     // +2 hours
    instagram: 180,    // +3 hours
    pinterest: 240,    // +4 hours
    tiktok: 300,       // +5 hours
    gbp: 360,          // +6 hours
    youtube: 420,      // +7 hours
    reddit: 480,       // +8 hours
    telegram: 540,     // +9 hours
  }

  for (const platform of params.platforms) {
    const captionData = params.captions[platform]
    const accountId = params.accountIds[platform]
    if (!captionData || !accountId) continue

    const scheduledTime = new Date(params.baseTime)
    scheduledTime.setMinutes(scheduledTime.getMinutes() + staggerMinutes[platform])

    try {
      const result = await schedulePost({
        accountId,
        platform,
        caption: captionData.caption,
        hashtags: captionData.hashtags,
        mediaUrls: params.mediaUrls,
        mediaType: params.mediaType,
        scheduledTime,
        firstComment: captionData.firstComment,
      })
      results.push(result)
    } catch (error) {
      console.error(`Failed to schedule ${platform} post:`, error)
    }
  }

  return results
}
