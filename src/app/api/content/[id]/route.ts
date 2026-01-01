import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        wrhqBlogPost: true,
        images: {
          orderBy: { imageType: 'asc' },
        },
        podcast: true,
        videos: true,
        socialPosts: {
          orderBy: { platform: 'asc' },
        },
        wrhqSocialPosts: {
          orderBy: { platform: 'asc' },
        },
        publishingLogs: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 })
    }

    return NextResponse.json(contentItem)
  } catch (error) {
    console.error('Failed to fetch content:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    )
  }
}

// PATCH - Partial update for approvals, status changes, etc.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const data = await request.json()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    // Approval status fields
    const approvalFields = [
      'blogApproved', 'imagesApproved', 'socialApproved',
      'wrhqBlogApproved', 'wrhqSocialApproved',
      'podcastDescApproved', 'videoDescApproved', 'longformVideoApproved'
    ]

    // Boolean status fields
    const booleanFields = [
      'blogGenerated', 'imagesGenerated', 'socialGenerated',
      'wrhqBlogGenerated', 'wrhqSocialGenerated',
      'clientBlogPublished', 'wrhqBlogPublished', 'socialPublished',
      'podcastGenerated', 'podcastAddedToPost',
      'shortVideoGenerated', 'shortVideoAddedToPost',
      'longVideoUploaded', 'longVideoAddedToPost',
      'schemaGenerated', 'needsAttention'
    ]

    // String fields
    const stringFields = [
      'status', 'pipelineStep', 'lastError', 'notes',
      'clientBlogUrl', 'wrhqBlogUrl',
      'podcastStatus', 'podcastDescription',
      'shortVideoStatus', 'shortVideoDescription',
      'longformVideoUrl', 'longformVideoDesc'
    ]

    // Number fields
    const numberFields = [
      'imagesApprovedCount', 'imagesTotalCount',
      'socialApprovedCount', 'socialTotalCount',
      'wrhqSocialApprovedCount', 'wrhqSocialTotalCount',
      'schemaUpdateCount', 'completionPercent'
    ]

    // DateTime fields
    const dateFields = [
      'clientBlogPublishedAt', 'wrhqBlogPublishedAt', 'socialPublishedAt',
      'podcastAddedAt', 'shortVideoAddedAt', 'longVideoAddedAt',
      'schemaLastUpdated'
    ]

    for (const field of approvalFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    for (const field of booleanFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    for (const field of stringFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    for (const field of numberFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    for (const field of dateFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field] ? new Date(data[field]) : null
      }
    }

    const contentItem = await prisma.contentItem.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        blogPost: true,
        images: true,
        socialPosts: true,
        wrhqSocialPosts: true,
        podcast: true,
        videos: true,
      },
    })

    return NextResponse.json(contentItem)
  } catch (error) {
    console.error('Failed to update content:', error)
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const data = await request.json()

    const contentItem = await prisma.contentItem.update({
      where: { id },
      data: {
        paaQuestion: data.paaQuestion,
        topic: data.topic,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
        scheduledTime: data.scheduledTime,
        priority: data.priority,
        notes: data.notes,
        status: data.status,
      },
    })

    return NextResponse.json(contentItem)
  } catch (error) {
    console.error('Failed to update content:', error)
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    await prisma.contentItem.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete content:', error)
    return NextResponse.json(
      { error: 'Failed to delete content' },
      { status: 500 }
    )
  }
}
