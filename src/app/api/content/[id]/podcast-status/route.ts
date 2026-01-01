import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkPodcastStatus } from '@/lib/integrations/autocontent'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Check and update podcast status
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const podcast = await prisma.podcast.findUnique({
      where: { contentItemId: id },
    })

    if (!podcast) {
      return NextResponse.json({ status: 'not_found' })
    }

    // If already ready, just return
    if (podcast.status === 'READY' && podcast.audioUrl) {
      return NextResponse.json({
        status: 'ready',
        audioUrl: podcast.audioUrl,
        duration: podcast.duration,
      })
    }

    // If processing, check with AutoContent API
    if (podcast.status === 'PROCESSING' && podcast.autocontentJobId) {
      try {
        const result = await checkPodcastStatus(podcast.autocontentJobId)

        if (result.status === 'completed' && result.audioUrl) {
          // Update podcast record with completed data
          await prisma.podcast.update({
            where: { contentItemId: id },
            data: {
              audioUrl: result.audioUrl,
              duration: result.duration,
              status: 'READY',
            },
          })

          // Update content item
          await prisma.contentItem.update({
            where: { id },
            data: {
              podcastGenerated: true,
              podcastStatus: 'ready',
              podcastUrl: result.audioUrl,
            },
          })

          return NextResponse.json({
            status: 'ready',
            audioUrl: result.audioUrl,
            duration: result.duration,
          })
        }

        if (result.status === 'failed') {
          await prisma.podcast.update({
            where: { contentItemId: id },
            data: { status: 'FAILED' },
          })

          await prisma.contentItem.update({
            where: { id },
            data: { podcastStatus: 'failed' },
          })

          return NextResponse.json({ status: 'failed' })
        }

        // Still processing
        return NextResponse.json({ status: 'processing' })
      } catch (error) {
        console.error('Error checking podcast status:', error)
        return NextResponse.json({ status: 'processing', error: String(error) })
      }
    }

    return NextResponse.json({ status: podcast.status?.toLowerCase() || 'unknown' })
  } catch (error) {
    console.error('Failed to check podcast status:', error)
    return NextResponse.json(
      { error: 'Failed to check podcast status' },
      { status: 500 }
    )
  }
}
