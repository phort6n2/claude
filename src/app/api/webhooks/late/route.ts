import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'

/**
 * POST /api/webhooks/late - Receive webhook notifications from Late
 *
 * Events handled:
 * - post.published: Post successfully published to platform
 * - post.failed: Post failed to publish
 * - post.partial: Post published to some platforms but failed on others
 * - post.scheduled: Post successfully scheduled
 * - account.disconnected: Social account was disconnected/revoked
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const payload = JSON.parse(body)

    console.log('Late webhook received:', JSON.stringify(payload, null, 2))

    // Optional: Verify webhook signature if secret is configured
    const signature = request.headers.get('X-Late-Signature')
    const webhookSecret = process.env.LATE_WEBHOOK_SECRET

    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')

      if (signature !== expectedSignature) {
        console.error('Late webhook signature mismatch')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const { event, data } = payload

    // Handle different event types
    switch (event) {
      case 'post.published':
        await handlePostPublished(data)
        break

      case 'post.failed':
        await handlePostFailed(data)
        break

      case 'post.partial':
        await handlePostPartial(data)
        break

      case 'post.scheduled':
        await handlePostScheduled(data)
        break

      case 'account.disconnected':
        await handleAccountDisconnected(payload)
        break

      case 'webhook.test':
        console.log('Late webhook test received')
        break

      default:
        console.log(`Unhandled Late webhook event: ${event}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Late webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

interface PostEventData {
  postId?: string
  post?: {
    id?: string
    _id?: string
    status: string
    platforms?: Array<{
      platform: string
      accountId?: string | { _id: string }
      status: string
      publishedUrl?: string      // From webhook payload
      platformPostUrl?: string   // Alternative field name
      platformPostId?: string
      error?: string
      errorMessage?: string
    }>
  }
  // Alternative flat structure (some events may use this)
  platforms?: Array<{
    platform: string
    status: string
    publishedUrl?: string
    platformPostUrl?: string
    error?: string
    errorMessage?: string
  }>
  error?: string
  errorMessage?: string
  timestamp?: string
}

async function handlePostPublished(data: PostEventData) {
  const postId = data.postId || data.post?.id || data.post?._id

  if (!postId) {
    console.error('No post ID in webhook data')
    return
  }

  // Get post URL from the correct location (webhook uses publishedUrl, API uses platformPostUrl)
  const platformData = data.post?.platforms?.[0] || data.platforms?.[0]
  const postUrl = platformData?.publishedUrl || platformData?.platformPostUrl

  console.log(`Post published: ${postId}, URL: ${postUrl}`)

  // Try to find and update client social post
  const clientPost = await prisma.socialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (clientPost) {
    await prisma.socialPost.update({
      where: { id: clientPost.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedUrl: postUrl || null,
      },
    })
    console.log(`Updated client social post ${clientPost.id} to PUBLISHED`)
    return
  }

  // Try to find and update WRHQ social post
  const wrhqPost = await prisma.wRHQSocialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (wrhqPost) {
    await prisma.wRHQSocialPost.update({
      where: { id: wrhqPost.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedUrl: postUrl || null,
      },
    })
    console.log(`Updated WRHQ social post ${wrhqPost.id} to PUBLISHED`)
    return
  }

  console.log(`No matching post found for Late post ID: ${postId}`)
}

async function handlePostFailed(data: PostEventData) {
  const postId = data.postId || data.post?.id || data.post?._id

  if (!postId) {
    console.error('No post ID in webhook data')
    return
  }

  // Get error from various possible locations
  const platformData = data.post?.platforms?.[0] || data.platforms?.[0]
  const errorMessage = platformData?.error || platformData?.errorMessage || data.error || data.errorMessage || 'Post failed to publish'

  console.log(`Post failed: ${postId}, Error: ${errorMessage}`)

  // Try to find and update client social post
  const clientPost = await prisma.socialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (clientPost) {
    await prisma.socialPost.update({
      where: { id: clientPost.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    })
    console.log(`Updated client social post ${clientPost.id} to FAILED`)
    return
  }

  // Try to find and update WRHQ social post
  const wrhqPost = await prisma.wRHQSocialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (wrhqPost) {
    await prisma.wRHQSocialPost.update({
      where: { id: wrhqPost.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    })
    console.log(`Updated WRHQ social post ${wrhqPost.id} to FAILED`)
    return
  }

  console.log(`No matching post found for Late post ID: ${postId}`)
}

async function handlePostPartial(data: PostEventData) {
  // For partial success, update each platform individually
  const postId = data.postId || data.post?.id || data.post?._id

  if (!postId) {
    console.error('No post ID in webhook data')
    return
  }

  const platforms = data.post?.platforms || data.platforms
  if (!platforms || platforms.length === 0) {
    console.log(`Post partial with no platform data: ${postId}`)
    return
  }

  for (const platform of platforms) {
    const status = platform.status?.toLowerCase()

    if (status === 'published') {
      // Find and update as published
      const platformName = platform.platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM'
      const clientPost = await prisma.socialPost.findFirst({
        where: {
          getlatePostId: postId,
          platform: platformName,
        },
      })

      if (clientPost) {
        await prisma.socialPost.update({
          where: { id: clientPost.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedUrl: platform.publishedUrl || platform.platformPostUrl || null,
          },
        })
      }
    } else if (status === 'failed') {
      // Find and update as failed
      const platformName = platform.platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM'
      const clientPost = await prisma.socialPost.findFirst({
        where: {
          getlatePostId: postId,
          platform: platformName,
        },
      })

      if (clientPost) {
        await prisma.socialPost.update({
          where: { id: clientPost.id },
          data: {
            status: 'FAILED',
            errorMessage: platform.error || platform.errorMessage || 'Post failed to publish',
          },
        })
      }
    }
  }
}

async function handlePostScheduled(data: PostEventData) {
  const postId = data.postId || data.post?.id || data.post?._id

  if (!postId) {
    console.error('No post ID in webhook data')
    return
  }

  console.log(`Post scheduled: ${postId}`)

  // Update status to SCHEDULED
  const clientPost = await prisma.socialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (clientPost && clientPost.status === 'PROCESSING') {
    await prisma.socialPost.update({
      where: { id: clientPost.id },
      data: {
        status: 'SCHEDULED',
      },
    })
    console.log(`Updated client social post ${clientPost.id} to SCHEDULED`)
    return
  }

  const wrhqPost = await prisma.wRHQSocialPost.findFirst({
    where: { getlatePostId: postId },
  })

  if (wrhqPost && wrhqPost.status === 'PROCESSING') {
    await prisma.wRHQSocialPost.update({
      where: { id: wrhqPost.id },
      data: {
        status: 'SCHEDULED',
      },
    })
    console.log(`Updated WRHQ social post ${wrhqPost.id} to SCHEDULED`)
  }
}

interface AccountDisconnectedPayload {
  event: string
  account?: {
    id?: string
    _id?: string
    platform?: string
    name?: string
  }
  accountId?: string
  platform?: string
  reason?: string
  timestamp?: string
}

async function handleAccountDisconnected(payload: AccountDisconnectedPayload) {
  const accountId = payload.account?.id || payload.account?._id || payload.accountId
  const platform = payload.account?.platform || payload.platform
  const reason = payload.reason || 'Account disconnected or access revoked'
  const timestamp = payload.timestamp || new Date().toISOString()

  console.log(`Account disconnected: ${platform} (${accountId}) - ${reason}`)

  if (!accountId) {
    console.error('No account ID in disconnection webhook')
    return
  }

  // Find all clients that have social account IDs configured
  const clients = await prisma.client.findMany({
    where: {
      socialAccountIds: {
        not: Prisma.JsonNull,
      },
    },
    select: {
      id: true,
      businessName: true,
      socialAccountIds: true,
      disconnectedAccounts: true,
    },
  })

  // Check each client to see if they use this account
  for (const client of clients) {
    const accountIds = client.socialAccountIds as Record<string, string> | null
    if (!accountIds) continue

    // Find which platform(s) use this account ID
    const affectedPlatforms: string[] = []
    for (const [platformKey, id] of Object.entries(accountIds)) {
      if (id === accountId) {
        affectedPlatforms.push(platformKey)
      }
    }

    if (affectedPlatforms.length === 0) continue

    // Update the client's disconnectedAccounts field
    const currentDisconnected = (client.disconnectedAccounts as Record<string, unknown>) || {}

    for (const platformKey of affectedPlatforms) {
      currentDisconnected[platformKey] = {
        disconnectedAt: timestamp,
        reason: reason,
        accountId: accountId,
      }
    }

    await prisma.client.update({
      where: { id: client.id },
      data: {
        disconnectedAccounts: currentDisconnected as Prisma.InputJsonValue,
      },
    })

    console.log(`Marked ${affectedPlatforms.join(', ')} as disconnected for client: ${client.businessName}`)
  }
}
