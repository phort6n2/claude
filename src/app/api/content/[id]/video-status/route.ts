import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkVideoStatus } from '@/lib/integrations/creatify'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Check and update short video status
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Find the SHORT video for this content item
    const video = await prisma.video.findFirst({
      where: {
        contentItemId: id,
        videoType: 'SHORT',
      },
    })

    if (!video) {
      return NextResponse.json({ status: 'not_found' })
    }

    // If already ready, just return
    if (video.status === 'READY' && video.videoUrl) {
      return NextResponse.json({
        status: 'ready',
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
      })
    }

    // If processing, check with Creatify API
    if (video.status === 'PROCESSING' && video.providerJobId) {
      try {
        const result = await checkVideoStatus(video.providerJobId)

        if (result.status === 'completed' && result.videoUrl) {
          // Update video record with completed data
          await prisma.video.update({
            where: { id: video.id },
            data: {
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl || null,
              duration: result.duration || null,
              status: 'READY',
            },
          })

          // Update content item
          await prisma.contentItem.update({
            where: { id },
            data: {
              shortVideoGenerated: true,
              shortVideoStatus: 'ready',
            },
          })

          return NextResponse.json({
            status: 'ready',
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            duration: result.duration,
          })
        }

        if (result.status === 'failed') {
          await prisma.video.update({
            where: { id: video.id },
            data: { status: 'FAILED' },
          })

          await prisma.contentItem.update({
            where: { id },
            data: { shortVideoStatus: 'failed' },
          })

          return NextResponse.json({ status: 'failed' })
        }

        // Still processing
        return NextResponse.json({ status: 'processing' })
      } catch (error) {
        console.error('Error checking video status:', error)
        return NextResponse.json({ status: 'processing', error: String(error) })
      }
    }

    return NextResponse.json({ status: video.status?.toLowerCase() || 'unknown' })
  } catch (error) {
    console.error('Failed to check video status:', error)
    return NextResponse.json(
      { error: 'Failed to check video status' },
      { status: 500 }
    )
  }
}
