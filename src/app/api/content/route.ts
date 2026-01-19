import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (clientId && clientId !== 'all') where.clientId = clientId
    if (status && status !== 'all') where.status = status

    const contentItems = await prisma.contentItem.findMany({
      where,
      orderBy: { scheduledDate: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            primaryColor: true,
          },
        },
        serviceLocation: {
          select: {
            id: true,
            city: true,
            state: true,
            neighborhood: true,
          },
        },
        blogPost: {
          select: {
            wordpressPostId: true,
            schemaJson: true,
          },
        },
        podcast: {
          select: {
            podbeanUrl: true,
          },
        },
        socialPosts: {
          select: {
            id: true,
            platform: true,
            publishedUrl: true,
          },
        },
        shortFormVideos: {
          select: {
            id: true,
            publishedUrls: true,
          },
        },
      },
    })

    return NextResponse.json(contentItems)
  } catch (error) {
    console.error('Failed to fetch content:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const contentItem = await prisma.contentItem.create({
      data: {
        clientId: data.clientId,
        clientPAAId: data.clientPAAId || null,
        serviceLocationId: data.serviceLocationId || null,
        paaQuestion: data.paaQuestion,
        topic: data.topic || null,
        scheduledDate: new Date(data.scheduledDate),
        scheduledTime: data.scheduledTime || '09:00',
        priority: data.priority || 0,
        notes: data.notes || null,
        status: data.status || 'DRAFT',
        pipelineStep: null,
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    })

    // If triggerGeneration is true, start the content pipeline immediately
    if (data.triggerGeneration && contentItem.id) {
      // Run pipeline in background (don't await)
      runContentPipeline(contentItem.id).catch((err) => {
        console.error(`[Content API] Pipeline failed for ${contentItem.id}:`, err)
      })
    }

    return NextResponse.json(contentItem, { status: 201 })
  } catch (error) {
    console.error('Failed to create content:', error)
    return NextResponse.json(
      { error: 'Failed to create content' },
      { status: 500 }
    )
  }
}
