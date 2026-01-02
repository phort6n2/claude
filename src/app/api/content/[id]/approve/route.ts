import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Image, SocialPost, WRHQSocialPost } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/approve - Approve content pieces
 * Body: {
 *   field: 'blog' | 'images' | 'social' | 'wrhqBlog' | 'wrhqSocial' | 'podcast' | 'video' | 'longformVideo',
 *   status: 'APPROVED' | 'NEEDS_REVISION',
 *   itemId?: string // For individual image/social post approval
 *   note?: string
 * }
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { field, status, itemId, note } = body

    if (!field || !status) {
      return NextResponse.json({ error: 'field and status are required' }, { status: 400 })
    }

    if (!['APPROVED', 'NEEDS_REVISION', 'PENDING'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get content item
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        images: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    switch (field) {
      case 'blog':
        updateData.blogApproved = status
        break

      case 'images':
        if (itemId) {
          // Approve individual image
          await prisma.image.update({
            where: { id: itemId },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          // Update count
          const approvedCount = contentItem.images.filter(
            (img: Image) => img.id === itemId ? status === 'APPROVED' : img.approved
          ).length

          updateData.imagesApprovedCount = approvedCount
          updateData.imagesApproved = approvedCount === contentItem.imagesTotalCount ? 'APPROVED' : 'PENDING'
        } else {
          // Approve all images
          await prisma.image.updateMany({
            where: { contentItemId: id },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          updateData.imagesApproved = status
          updateData.imagesApprovedCount = status === 'APPROVED' ? contentItem.imagesTotalCount : 0
        }
        break

      case 'social':
        if (itemId) {
          // Approve individual social post
          await prisma.socialPost.update({
            where: { id: itemId },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          // Update count
          const socialApprovedCount = contentItem.socialPosts.filter(
            (post: SocialPost) => post.id === itemId ? status === 'APPROVED' : post.approved
          ).length

          updateData.socialApprovedCount = socialApprovedCount
          updateData.socialApproved = socialApprovedCount === contentItem.socialTotalCount ? 'APPROVED' : 'PENDING'
        } else {
          // Approve all social posts
          await prisma.socialPost.updateMany({
            where: { contentItemId: id },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          updateData.socialApproved = status
          updateData.socialApprovedCount = status === 'APPROVED' ? contentItem.socialTotalCount : 0
        }
        break

      case 'wrhqBlog':
        updateData.wrhqBlogApproved = status
        break

      case 'wrhqSocial':
        if (itemId) {
          // Approve individual WRHQ social post
          await prisma.wRHQSocialPost.update({
            where: { id: itemId },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          // Update count
          const wrhqApprovedCount = contentItem.wrhqSocialPosts.filter(
            (post: WRHQSocialPost) => post.id === itemId ? status === 'APPROVED' : post.approved
          ).length

          updateData.wrhqSocialApprovedCount = wrhqApprovedCount
          updateData.wrhqSocialApproved = wrhqApprovedCount === contentItem.wrhqSocialTotalCount ? 'APPROVED' : 'PENDING'
        } else {
          // Approve all WRHQ social posts
          await prisma.wRHQSocialPost.updateMany({
            where: { contentItemId: id },
            data: {
              approved: status === 'APPROVED',
              approvedAt: status === 'APPROVED' ? new Date() : null,
            },
          })

          updateData.wrhqSocialApproved = status
          updateData.wrhqSocialApprovedCount = status === 'APPROVED' ? contentItem.wrhqSocialTotalCount : 0
        }
        break

      case 'podcast':
        updateData.podcastDescApproved = status
        break

      case 'video':
        updateData.videoDescApproved = status
        break

      case 'longformVideo':
        updateData.longformVideoApproved = status
        break

      default:
        return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    // Update content item
    await prisma.contentItem.update({
      where: { id },
      data: updateData,
    })

    // Check if all required items are approved and update status
    const updatedItem = await prisma.contentItem.findUnique({
      where: { id },
    })

    if (updatedItem) {
      const allApproved =
        updatedItem.blogApproved === 'APPROVED' &&
        updatedItem.imagesApproved === 'APPROVED' &&
        updatedItem.socialApproved === 'APPROVED'

      if (allApproved && updatedItem.status === 'REVIEW') {
        await prisma.contentItem.update({
          where: { id },
          data: { status: 'APPROVED' },
        })
      }

      // Calculate completion percentage
      const completionPercent = calculateCompletionPercent(updatedItem)
      const needsAttention = checkNeedsAttention(updatedItem)

      await prisma.contentItem.update({
        where: { id },
        data: {
          completionPercent,
          needsAttention,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 })
  }
}

/**
 * POST /api/content/[id]/approve-all - Bulk approve all content
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get content item
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        images: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Approve all generated content
    const now = new Date()

    // Approve images
    if (contentItem.imagesGenerated) {
      await prisma.image.updateMany({
        where: { contentItemId: id },
        data: { approved: true, approvedAt: now },
      })
    }

    // Approve social posts
    if (contentItem.socialGenerated) {
      await prisma.socialPost.updateMany({
        where: { contentItemId: id },
        data: { approved: true, approvedAt: now },
      })
    }

    // Approve WRHQ social posts
    if (contentItem.wrhqSocialGenerated) {
      await prisma.wRHQSocialPost.updateMany({
        where: { contentItemId: id },
        data: { approved: true, approvedAt: now },
      })
    }

    // Update content item
    await prisma.contentItem.update({
      where: { id },
      data: {
        blogApproved: contentItem.blogGenerated ? 'APPROVED' : 'PENDING',
        imagesApproved: contentItem.imagesGenerated ? 'APPROVED' : 'PENDING',
        imagesApprovedCount: contentItem.imagesTotalCount,
        socialApproved: contentItem.socialGenerated ? 'APPROVED' : 'PENDING',
        socialApprovedCount: contentItem.socialTotalCount,
        wrhqBlogApproved: contentItem.wrhqBlogGenerated ? 'APPROVED' : 'PENDING',
        wrhqSocialApproved: contentItem.wrhqSocialGenerated ? 'APPROVED' : 'PENDING',
        wrhqSocialApprovedCount: contentItem.wrhqSocialTotalCount,
        status: 'APPROVED',
        completionPercent: 45, // Base approval completion
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Bulk approval error:', error)
    return NextResponse.json({ error: 'Failed to approve all' }, { status: 500 })
  }
}

function calculateCompletionPercent(item: {
  blogApproved: string
  imagesApproved: string
  socialApproved: string
  wrhqBlogApproved: string
  wrhqSocialApproved: string
  clientBlogPublished: boolean
  wrhqBlogPublished: boolean
  socialPublished: boolean
  podcastAddedToPost: boolean
}): number {
  let percent = 0

  // Blog approved: 20%
  if (item.blogApproved === 'APPROVED') percent += 20

  // Images approved: 15%
  if (item.imagesApproved === 'APPROVED') percent += 15

  // Social approved: 10%
  if (item.socialApproved === 'APPROVED') percent += 10

  // WRHQ blog approved: 15%
  if (item.wrhqBlogApproved === 'APPROVED') percent += 15

  // WRHQ social approved: 10%
  if (item.wrhqSocialApproved === 'APPROVED') percent += 10

  // Client blog published: 10%
  if (item.clientBlogPublished) percent += 10

  // WRHQ blog published: 10%
  if (item.wrhqBlogPublished) percent += 10

  // Social published: 5%
  if (item.socialPublished) percent += 5

  // Podcast added: 5%
  if (item.podcastAddedToPost) percent += 5

  return percent
}

function checkNeedsAttention(item: {
  status: string
  scheduledDate: Date
  blogGenerated: boolean
  blogApproved: string
  updatedAt: Date
}): boolean {
  // Generated but not approved for 24+ hours
  if (item.blogGenerated && item.blogApproved === 'PENDING') {
    const hoursSinceUpdate = (Date.now() - item.updatedAt.getTime()) / (1000 * 60 * 60)
    if (hoursSinceUpdate > 24) return true
  }

  // Publishing failed
  if (item.status === 'FAILED') return true

  // Scheduled date is in past but not published
  const now = new Date()
  if (item.scheduledDate < now && item.status !== 'PUBLISHED') return true

  return false
}
