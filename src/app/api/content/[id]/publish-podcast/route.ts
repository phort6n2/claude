import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { publishToPodbean } from '@/lib/integrations/podbean'
import { updatePost } from '@/lib/integrations/wordpress'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/publish-podcast - Publish podcast to Podbean and embed in blog
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

    // Publish to Podbean
    const podbeanResult = await publishToPodbean({
      title: contentItem.blogPost?.title || contentItem.paaQuestion,
      description: contentItem.podcast.description || contentItem.podcastDescription || '',
      audioUrl: contentItem.podcast.audioUrl,
    })

    // Generate iframe embed code
    const podcastEmbed = `<iframe title="${contentItem.blogPost?.title || contentItem.paaQuestion}" allowtransparency="true" height="150" width="100%" style="border: none; min-width: min(100%, 430px);height:150px;" scrolling="no" data-name="pb-iframe-player" src="${podbeanResult.playerUrl}&from=pb6admin&share=1&download=1&rtl=0&fonts=Arial&skin=1&font-color=&logo_link=episode_page&btn-skin=7" loading="lazy"></iframe>`

    // Update WordPress blog post with podcast embed
    if (contentItem.blogPost?.wordpressPostId && contentItem.client.wordpressUrl) {
      const updatedContent = contentItem.blogPost.content + `\n\n<!-- Podcast Episode -->\n<div class="podcast-embed" style="margin: 30px 0;">\n<h3>Listen to This Episode</h3>\n${podcastEmbed}\n</div>`

      await updatePost(
        {
          url: contentItem.client.wordpressUrl,
          username: contentItem.client.wordpressUsername || '',
          password: contentItem.client.wordpressAppPassword || '',
        },
        contentItem.blogPost.wordpressPostId,
        { content: updatedContent }
      )
    }

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

    // Update content item
    await prisma.contentItem.update({
      where: { id },
      data: {
        podcastGenerated: true,
        podcastAddedToPost: true,
        podcastAddedAt: new Date(),
        podcastUrl: podbeanResult.url,
      },
    })

    return NextResponse.json({
      success: true,
      url: podbeanResult.url,
      playerUrl: podbeanResult.playerUrl,
    })
  } catch (error) {
    console.error('Podcast publishing error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
