import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateGBPPost, incrementLinkRotation } from '@/lib/gbp/post-generator'
import { schedulePost } from '@/lib/integrations/getlate'
import { GBPPhotoSource, GBPPostStatus, GBPCtaType } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/gbp-posts
 * List all GBP posts for a client
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as GBPPostStatus | null
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get posts
    const where = {
      clientId: id,
      ...(status ? { status } : {}),
    }

    const [posts, total] = await Promise.all([
      prisma.gBPPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.gBPPost.count({ where }),
    ])

    return NextResponse.json({
      posts,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Failed to get GBP posts:', error)
    return NextResponse.json({ error: 'Failed to get posts' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/gbp-posts
 * Create a new GBP post (generate or manual)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const data = await request.json()
    const { action } = data

    // Get client and config
    const client = await prisma.client.findUnique({
      where: { id },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const config = await prisma.gBPPostConfig.findUnique({
      where: { clientId: id },
    })

    if (!config) {
      return NextResponse.json(
        { error: 'GBP config not set up. Please configure GBP posting first.' },
        { status: 400 }
      )
    }

    // Action: Generate a new post using AI
    if (action === 'generate') {
      const { topic, ctaUrl, ctaLabel } = data

      const generated = await generateGBPPost({
        client,
        config,
        topic,
        ctaUrl,
        ctaLabel,
      })

      // Create draft post
      const post = await prisma.gBPPost.create({
        data: {
          clientId: id,
          configId: config.id,
          content: generated.content,
          photoUrl: generated.photoUrl,
          photoSource: generated.photoSource as GBPPhotoSource,
          ctaUrl: generated.ctaUrl,
          ctaType: generated.ctaType as GBPCtaType,
          rotationLinkIndex: generated.rotationLinkIndex,
          rotationLinkLabel: generated.rotationLinkLabel,
          status: 'DRAFT',
        },
      })

      return NextResponse.json({ post, generated: true })
    }

    // Action: Create manual post
    if (action === 'create') {
      const { content, photoUrl, photoSource, ctaUrl, ctaType, scheduledFor } = data

      if (!content) {
        return NextResponse.json(
          { error: 'Content is required' },
          { status: 400 }
        )
      }

      const post = await prisma.gBPPost.create({
        data: {
          clientId: id,
          configId: config.id,
          content,
          photoUrl: photoUrl || null,
          photoSource: (photoSource as GBPPhotoSource) || 'UPLOADED',
          ctaUrl: ctaUrl || null,
          ctaType: (ctaType as GBPCtaType) || null,
          status: scheduledFor ? 'SCHEDULED' : 'DRAFT',
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        },
      })

      return NextResponse.json({ post })
    }

    // Action: Publish a post immediately
    if (action === 'publish') {
      const { postId } = data

      if (!postId) {
        return NextResponse.json(
          { error: 'Post ID is required' },
          { status: 400 }
        )
      }

      const post = await prisma.gBPPost.findUnique({
        where: { id: postId },
      })

      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      }

      if (post.clientId !== id) {
        return NextResponse.json({ error: 'Post belongs to different client' }, { status: 403 })
      }

      // Get Late account ID for GBP
      const socialAccountIds = client.socialAccountIds as Record<string, string> | null
      const gbpAccountId = socialAccountIds?.gbp

      if (!gbpAccountId) {
        return NextResponse.json(
          { error: 'No GBP account connected in Late. Please connect GBP in client settings.' },
          { status: 400 }
        )
      }

      // Update status to publishing
      await prisma.gBPPost.update({
        where: { id: postId },
        data: { status: 'PUBLISHING' },
      })

      try {
        // Publish via Late
        const result = await schedulePost({
          accountId: gbpAccountId,
          platform: 'gbp',
          caption: post.content,
          mediaUrls: post.photoUrl ? [post.photoUrl] : undefined,
          mediaType: post.photoUrl ? 'image' : undefined,
          scheduledTime: new Date(),
          ctaUrl: post.ctaUrl || undefined,
        })

        // Update post with result
        const updatedPost = await prisma.gBPPost.update({
          where: { id: postId },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            latePostId: result.postId,
            platformPostUrl: result.platformPostUrl || null,
          },
        })

        // Increment link rotation if this post used a rotation link
        if (post.rotationLinkIndex !== null) {
          await incrementLinkRotation(config.id)
        }

        return NextResponse.json({ post: updatedPost, published: true })
      } catch (publishError) {
        // Update post with error
        await prisma.gBPPost.update({
          where: { id: postId },
          data: {
            status: 'FAILED',
            errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error',
            retryCount: { increment: 1 },
          },
        })

        throw publishError
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('GBP post action failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/clients/[id]/gbp-posts
 * Delete a GBP post
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    const post = await prisma.gBPPost.findUnique({
      where: { id: postId },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.clientId !== id) {
      return NextResponse.json({ error: 'Post belongs to different client' }, { status: 403 })
    }

    // Only allow deleting draft or failed posts
    if (post.status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Cannot delete published posts' },
        { status: 400 }
      )
    }

    await prisma.gBPPost.delete({
      where: { id: postId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete GBP post:', error)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
