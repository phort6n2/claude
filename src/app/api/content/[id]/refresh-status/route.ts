import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkPostStatus } from '@/lib/integrations/getlate'
import { checkVideoStatus } from '@/lib/integrations/creatify'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/refresh-status - Refresh status of social posts from Late API
 * Also checks video status and triggers pipeline completion if needed
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    const results = {
      updated: 0,
      checked: 0,
      errors: [] as string[],
    }

    // Check client social posts with PROCESSING status
    const processingClientPosts = contentItem.socialPosts.filter(p =>
      p.status === 'PROCESSING' && p.getlatePostId
    )

    for (const post of processingClientPosts) {
      results.checked++
      try {
        const lateStatus = await checkPostStatus(post.getlatePostId!)

        let newStatus: 'PUBLISHED' | 'FAILED' | 'PROCESSING' = 'PROCESSING'
        if (lateStatus.status === 'published' && lateStatus.platformPostUrl) {
          newStatus = 'PUBLISHED'
        } else if (lateStatus.status === 'failed') {
          newStatus = 'FAILED'
        }

        if (newStatus !== 'PROCESSING') {
          await prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: newStatus,
              publishedUrl: lateStatus.platformPostUrl || null,
              publishedAt: newStatus === 'PUBLISHED' ? new Date() : null,
              errorMessage: lateStatus.error || null,
            },
          })
          results.updated++
          console.log(`Updated ${post.platform} post to ${newStatus}`)
        }
      } catch (error) {
        console.error(`Failed to check status for ${post.platform}:`, error)
        results.errors.push(`${post.platform}: ${String(error)}`)
      }
    }

    // Check WRHQ social posts with PROCESSING status
    const processingWrhqPosts = contentItem.wrhqSocialPosts.filter(p =>
      p.status === 'PROCESSING' && p.getlatePostId
    )

    for (const post of processingWrhqPosts) {
      results.checked++
      try {
        const lateStatus = await checkPostStatus(post.getlatePostId!)

        let newStatus: 'PUBLISHED' | 'FAILED' | 'PROCESSING' = 'PROCESSING'
        if (lateStatus.status === 'published' && lateStatus.platformPostUrl) {
          newStatus = 'PUBLISHED'
        } else if (lateStatus.status === 'failed') {
          newStatus = 'FAILED'
        }

        if (newStatus !== 'PROCESSING') {
          await prisma.wRHQSocialPost.update({
            where: { id: post.id },
            data: {
              status: newStatus,
              publishedUrl: lateStatus.platformPostUrl || null,
              publishedAt: newStatus === 'PUBLISHED' ? new Date() : null,
              errorMessage: lateStatus.error || null,
            },
          })
          results.updated++
          console.log(`Updated WRHQ ${post.platform} post to ${newStatus}`)
        }
      } catch (error) {
        console.error(`Failed to check status for WRHQ ${post.platform}:`, error)
        results.errors.push(`WRHQ ${post.platform}: ${String(error)}`)
      }
    }

    // Check video status if still processing
    const video = await prisma.video.findFirst({
      where: { contentItemId: id, videoType: 'SHORT' },
    })

    if (video?.status === 'PROCESSING' && video.providerJobId) {
      try {
        console.log('[RefreshStatus] Checking video status with Creatify...')
        const creatifyStatus = await checkVideoStatus(video.providerJobId)

        if (creatifyStatus.status === 'completed' && creatifyStatus.videoUrl) {
          await prisma.video.update({
            where: { id: video.id },
            data: {
              videoUrl: creatifyStatus.videoUrl,
              thumbnailUrl: creatifyStatus.thumbnailUrl || null,
              duration: creatifyStatus.duration || null,
              status: 'READY',
            },
          })

          await prisma.contentItem.update({
            where: { id },
            data: {
              shortVideoGenerated: true,
              shortVideoStatus: 'ready',
            },
          })

          console.log('[RefreshStatus] Video is ready! Triggering video-status endpoint to complete pipeline...')
          // Trigger the video-status endpoint which will run completeRemainingPipeline
          try {
            const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000'
            await fetch(`${baseUrl}/api/content/${id}/video-status`)
          } catch (triggerError) {
            console.error('[RefreshStatus] Failed to trigger video-status:', triggerError)
          }

          results.updated++
        } else if (creatifyStatus.status === 'failed') {
          await prisma.video.update({
            where: { id: video.id },
            data: { status: 'FAILED' },
          })
          await prisma.contentItem.update({
            where: { id },
            data: { shortVideoStatus: 'failed' },
          })
          results.updated++
        }
      } catch (videoError) {
        console.error('[RefreshStatus] Failed to check video status:', videoError)
        results.errors.push(`Video: ${String(videoError)}`)
      }
    }

    // If video is READY or FAILED AND podcast is done, but schema not generated, trigger pipeline completion
    // Schema needs BOTH video AND podcast to be done (or failed/not configured)
    const podcast = await prisma.podcast.findFirst({
      where: { contentItemId: id },
    })
    const podcastDone = !podcast || podcast.status === 'READY' || podcast.status === 'PUBLISHED' || podcast.status === 'FAILED' || contentItem.podcastGenerated
    const videoDone = !video || video.status === 'READY' || video.status === 'PUBLISHED' || video.status === 'FAILED'

    if (videoDone && podcastDone && !contentItem.schemaGenerated) {
      console.log(`[RefreshStatus] Both video (${video?.status || 'none'}) and podcast (${podcast?.status || 'none'}) done but schema not generated. Triggering video-status endpoint...`)
      try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000'
        await fetch(`${baseUrl}/api/content/${id}/video-status`)
      } catch (triggerError) {
        console.error('[RefreshStatus] Failed to trigger video-status:', triggerError)
      }
    } else if (!contentItem.schemaGenerated) {
      if (!videoDone) {
        console.log('[RefreshStatus] Video still processing - schema will run when both video and podcast complete')
      }
      if (!podcastDone) {
        console.log('[RefreshStatus] Podcast still processing - schema will run when both video and podcast complete')
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (error) {
    console.error('Refresh status error:', error)
    return NextResponse.json({ error: 'Failed to refresh status' }, { status: 500 })
  }
}
