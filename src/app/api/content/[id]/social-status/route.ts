import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkPostStatus } from '@/lib/integrations/getlate'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/content/[id]/social-status - Check and update status of PROCESSING social posts
 * Called by frontend polling to update post statuses from Late API
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Find all PROCESSING social posts for this content item
    const processingPosts = await prisma.socialPost.findMany({
      where: {
        contentItemId: id,
        status: 'PROCESSING',
        getlatePostId: { not: null },
      },
    })

    const processingWrhqPosts = await prisma.wRHQSocialPost.findMany({
      where: {
        contentItemId: id,
        status: 'PROCESSING',
        getlatePostId: { not: null },
      },
    })

    const results = {
      updated: 0,
      stillProcessing: 0,
      failed: 0,
      posts: [] as Array<{ id: string; platform: string; status: string; publishedUrl?: string }>,
    }

    // Check client social posts
    for (const post of processingPosts) {
      if (!post.getlatePostId) continue

      try {
        const status = await checkPostStatus(post.getlatePostId)

        if (status.status === 'published') {
          await prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              publishedUrl: status.platformPostUrl || null,
            },
          })
          results.updated++
          results.posts.push({
            id: post.id,
            platform: post.platform,
            status: 'PUBLISHED',
            publishedUrl: status.platformPostUrl,
          })
        } else if (status.status === 'failed') {
          await prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: status.error || 'Post failed',
            },
          })
          results.failed++
          results.posts.push({
            id: post.id,
            platform: post.platform,
            status: 'FAILED',
          })
        } else {
          results.stillProcessing++
        }
      } catch (error) {
        console.error(`Error checking status for post ${post.id}:`, error)
      }
    }

    // Check WRHQ social posts
    for (const post of processingWrhqPosts) {
      if (!post.getlatePostId) continue

      try {
        const status = await checkPostStatus(post.getlatePostId)

        if (status.status === 'published') {
          await prisma.wRHQSocialPost.update({
            where: { id: post.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              publishedUrl: status.platformPostUrl || null,
            },
          })
          results.updated++
          results.posts.push({
            id: post.id,
            platform: post.platform,
            status: 'PUBLISHED',
            publishedUrl: status.platformPostUrl,
          })
        } else if (status.status === 'failed') {
          await prisma.wRHQSocialPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: status.error || 'Post failed',
            },
          })
          results.failed++
          results.posts.push({
            id: post.id,
            platform: post.platform,
            status: 'FAILED',
          })
        } else {
          results.stillProcessing++
        }
      } catch (error) {
        console.error(`Error checking status for WRHQ post ${post.id}:`, error)
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Social status check error:', error)
    return NextResponse.json({ error: 'Failed to check social status' }, { status: 500 })
  }
}
