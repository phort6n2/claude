import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { validateDestinationUrl } from '@/lib/webhook-forwarding'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** List a client's outbound webhook destinations with their latest delivery. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const destinations = await prisma.webhookDestination.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            attempts: true,
            responseStatus: true,
            lastError: true,
            lastAttemptAt: true,
            createdAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      destinations: destinations.map((d) => ({
        id: d.id,
        label: d.label,
        url: d.url,
        enabled: d.enabled,
        createdAt: d.createdAt,
        lastDelivery: d.deliveries[0] ?? null,
      })),
    })
  } catch (error) {
    console.error('Failed to list webhook destinations:', error)
    return NextResponse.json(
      { error: 'Failed to list webhook destinations' },
      { status: 500 }
    )
  }
}

/** Add a destination. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (!label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    }

    const validated = validateDestinationUrl(typeof body.url === 'string' ? body.url : '')
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const destination = await prisma.webhookDestination.create({
      data: {
        clientId: id,
        label,
        url: validated.url,
        enabled: body.enabled !== false,
      },
    })

    return NextResponse.json(destination, { status: 201 })
  } catch (error) {
    console.error('Failed to create webhook destination:', error)
    return NextResponse.json(
      { error: 'Failed to create webhook destination' },
      { status: 500 }
    )
  }
}
