import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/webhooks/late - Receive webhook notifications from Late
 *
 * Events handled:
 * - post.published: Post successfully published to platform
 * - post.failed: Post failed to publish
 * - post.partial: Post published to some platforms but failed on others
 * - post.scheduled: Post successfully scheduled
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
  postId: string
  platforms?: Array<{
    platform: string
    accountId: string
    status: string
    postUrl?: string
    error?: string
  }>
  // Alternative flat structure
  platform?: string
  postUrl?: string
  url?: string
  error?: string
  errorMessage?: string
}

async function handlePostPublished(data: PostEventData) {
  const postId = data.postId

  // Get post URL from various possible locations
  const platformData = data.platforms?.[0]
  const postUrl = platformData?.postUrl || data.postUrl || data.url

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
  const postId = data.postId

  // Get error from various possible locations
  const platformData = data.platforms?.[0]
  const errorMessage = platformData?.error || data.error || data.errorMessage || 'Post failed to publish'

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
  const postId = data.postId

  if (!data.platforms || data.platforms.length === 0) {
    console.log(`Post partial with no platform data: ${postId}`)
    return
  }

  for (const platform of data.platforms) {
    const status = platform.status?.toLowerCase()

    if (status === 'published' || status === 'success') {
      // Find and update as published
      const clientPost = await prisma.socialPost.findFirst({
        where: {
          getlatePostId: postId,
          platform: platform.platform.toUpperCase(),
        },
      })

      if (clientPost) {
        await prisma.socialPost.update({
          where: { id: clientPost.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedUrl: platform.postUrl || null,
          },
        })
      }
    } else if (status === 'failed' || status === 'error') {
      // Find and update as failed
      const clientPost = await prisma.socialPost.findFirst({
        where: {
          getlatePostId: postId,
          platform: platform.platform.toUpperCase(),
        },
      })

      if (clientPost) {
        await prisma.socialPost.update({
          where: { id: clientPost.id },
          data: {
            status: 'FAILED',
            errorMessage: platform.error || 'Post failed to publish',
          },
        })
      }
    }
  }
}

async function handlePostScheduled(data: PostEventData) {
  const postId = data.postId

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
