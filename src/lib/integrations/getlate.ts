// getlate.dev API Integration for Social Media Scheduling

type Platform = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp'

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

  // Late API: https://getlate.dev/api/v1/
  const response = await fetch('https://getlate.dev/api/v1/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_id: params.accountId,
      platform: params.platform,
      content: fullCaption,
      media: params.mediaUrls?.map(url => ({
        url,
        type: params.mediaType || 'image',
      })),
      scheduled_at: params.scheduledTime.toISOString(),
      first_comment: params.firstComment,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`getlate API error: ${error}`)
  }

  const data = await response.json()

  return {
    postId: data.post_id,
    platform: params.platform,
    scheduledTime: new Date(data.scheduled_at),
    status: 'scheduled',
  }
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

  return {
    postId: data.post_id,
    platform: data.platform,
    scheduledTime: new Date(data.scheduled_at),
    status: data.status,
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
    facebook: 60,      // +1 hour
    linkedin: 120,     // +2 hours
    instagram: 180,    // +3 hours
    tiktok: 300,       // +5 hours
    gbp: 360,          // +6 hours
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
