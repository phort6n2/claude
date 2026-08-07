import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { validateDestinationUrl } from '@/lib/webhook-forwarding'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; webhookId: string }>
}

/** Update a destination (label, url, enabled). */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, webhookId } = await params
    const body = await request.json()

    const existing = await prisma.webhookDestination.findFirst({
      where: { id: webhookId, clientId: id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    const data: { label?: string; url?: string; enabled?: boolean } = {}

    if (typeof body.label === 'string') {
      const label = body.label.trim()
      if (!label) {
        return NextResponse.json({ error: 'Label is required' }, { status: 400 })
      }
      data.label = label
    }
    if (typeof body.url === 'string') {
      const validated = validateDestinationUrl(body.url)
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }
      data.url = validated.url
    }
    if (typeof body.enabled === 'boolean') {
      data.enabled = body.enabled
    }

    const destination = await prisma.webhookDestination.update({
      where: { id: webhookId },
      data,
    })

    return NextResponse.json(destination)
  } catch (error) {
    console.error('Failed to update webhook destination:', error)
    return NextResponse.json(
      { error: 'Failed to update webhook destination' },
      { status: 500 }
    )
  }
}

/** Delete a destination (its delivery history goes with it). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, webhookId } = await params

    const existing = await prisma.webhookDestination.findFirst({
      where: { id: webhookId, clientId: id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    await prisma.webhookDestination.delete({ where: { id: webhookId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete webhook destination:', error)
    return NextResponse.json(
      { error: 'Failed to delete webhook destination' },
      { status: 500 }
    )
  }
}
