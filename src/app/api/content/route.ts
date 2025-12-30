import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
      orderBy: { scheduledDate: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            primaryColor: true,
          },
        },
      },
    })

    return NextResponse.json(contentItems)
  } catch (error) {
    console.error('Failed to fetch content:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content' },
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
        paaQuestion: data.paaQuestion,
        paaSource: data.paaSource || 'manual',
        topic: data.topic || null,
        scheduledDate: new Date(data.scheduledDate),
        scheduledTime: data.scheduledTime || '09:00',
        priority: data.priority || 0,
        notes: data.notes || null,
        status: 'SCHEDULED',
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

    return NextResponse.json(contentItem, { status: 201 })
  } catch (error) {
    console.error('Failed to create content:', error)
    return NextResponse.json(
      { error: 'Failed to create content' },
      { status: 500 }
    )
  }
}
