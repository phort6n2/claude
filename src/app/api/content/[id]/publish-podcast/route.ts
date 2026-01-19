import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { publishToPodbean } from '@/lib/integrations/podbean'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/publish-podcast - Publish podcast to Podbean only
 * Note: Embedding in blog is now handled by the "Embed All Media" endpoint
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get content item with podcast and blog data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    if (!contentItem.podcast?.audioUrl) {
      return NextResponse.json({ error: 'No podcast audio available' }, { status: 400 })
    }

    if (contentItem.podcast.status !== 'READY') {
      return NextResponse.json({ error: 'Podcast is not ready for publishing' }, { status: 400 })
    }

    // Publish to Podbean (use client's specific podcast)
    const podbeanResult = await publishToPodbean({
      title: contentItem.blogPost?.title || contentItem.paaQuestion,
      description: contentItem.podcast.description || contentItem.podcastDescription || '',
      audioUrl: contentItem.podcast.audioUrl,
      podcastId: contentItem.client.podbeanPodcastId || undefined,
    })

    // Update podcast record
    await prisma.podcast.update({
      where: { id: contentItem.podcast.id },
      data: {
        podbeanEpisodeId: podbeanResult.episodeId,
        podbeanUrl: podbeanResult.url,
        podbeanPlayerUrl: podbeanResult.playerUrl,
        status: 'PUBLISHED',
      },
    })

    // Update content item - note: podcastAddedToPost is now set by embed-all-media
    await prisma.contentItem.update({
      where: { id },
      data: {
        podcastGenerated: true,
        podcastUrl: podbeanResult.url,
      },
    })

    return NextResponse.json({
      success: true,
      url: podbeanResult.url,
      playerUrl: podbeanResult.playerUrl,
      message: 'Podcast published to Podbean. Use "Embed All Media" to add it to the blog.',
    })
  } catch (error) {
    console.error('Podcast publishing error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
