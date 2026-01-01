// getlate.dev API Integration for Social Media Scheduling

type Platform = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram'

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
}

interface ScheduledPostResult {
  postId: string
  platform: Platform
  scheduledTime: Date
  status: 'scheduled' | 'published' | 'failed'
  platformPostUrl?: string  // URL to view the post on the social platform
}

export async function schedulePost(params: SchedulePostParams): Promise<ScheduledPostResult> {
  const apiKey = process.env.GETLATE_API_KEY
  if (!apiKey) {
    throw new Error('GETLATE_API_KEY is not configured')
  }

  // Format caption with hashtags for platforms that use them
  let fullCaption = params.caption
  if (params.hashtags && params.hashtags.length > 0) {
    const hashtagsText = params.hashtags.map(h => `#${h}`).join(' ')
    fullCaption = `${params.caption}\n\n${hashtagsText}`
  }

  // Build request body according to Late API docs
  // https://docs.getlate.dev/
  const latePlatform = getLatePlatform(params.platform)
  const requestBody: Record<string, unknown> = {
    content: fullCaption,
    platforms: [
      {
        platform: latePlatform,
        accountId: params.accountId,
      }
    ],
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

  // Add first comment if provided
  if (params.firstComment) {
    requestBody.firstComment = params.firstComment
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

  return {
    postId: data._id || data.id || data.post_id,
    platform: params.platform,
    scheduledTime: new Date(data.scheduledFor || data.scheduled_at || params.scheduledTime),
    status: data.status || (isImmediate ? 'published' : 'scheduled'),
    platformPostUrl: data.platformPostUrl || data.platform_post_url,
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
  const apiKey = process.env.GETLATE_API_KEY
  if (!apiKey) {
    throw new Error('GETLATE_API_KEY is not configured')
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

  // Extract platform from platforms array if present
  const platformData = data.platforms?.[0]

  return {
    postId: data._id || data.id || data.post_id,
    platform: platformData?.platform || data.platform,
    scheduledTime: new Date(data.scheduledFor || data.scheduled_at),
    status: data.status,
    platformPostUrl: data.platformPostUrl || data.platform_post_url,
  }
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
