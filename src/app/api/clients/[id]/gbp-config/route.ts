import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RotationLink } from '@/lib/gbp/post-generator'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/clients/[id]/gbp-config
 * Get GBP posting configuration for a client
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, businessName: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get or create GBP config
    let config = await prisma.gBPPostConfig.findUnique({
      where: { clientId: id },
      include: {
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!config) {
      // Create default config if not exists
      config = await prisma.gBPPostConfig.create({
        data: {
          clientId: id,
          enabled: false,
          frequency: 'WEEKLY',
          preferredDays: [1, 4], // Monday, Thursday
          preferredTime: '10:00',
          includePromo: true,
          includePhone: true,
        },
        include: {
          posts: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      })
    }

    // Check if Google is connected
    const isGoogleConnected = !!config.googleRefreshToken

    return NextResponse.json({
      ...config,
      isGoogleConnected,
      // Don't expose tokens to client
      googleAccessToken: undefined,
      googleRefreshToken: undefined,
    })
  } catch (error) {
    console.error('Failed to get GBP config:', error)
    return NextResponse.json({ error: 'Failed to get GBP config' }, { status: 500 })
  }
}

/**
 * PUT /api/clients/[id]/gbp-config
 * Update GBP posting configuration
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const data = await request.json()

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Validate rotation links if provided
    if (data.rotationLinks) {
      const links = data.rotationLinks as RotationLink[]
      for (const link of links) {
        if (!link.url || !link.label || !link.type) {
          return NextResponse.json(
            { error: 'Invalid rotation link: url, label, and type are required' },
            { status: 400 }
          )
        }
      }
    }

    // Upsert config
    const config = await prisma.gBPPostConfig.upsert({
      where: { clientId: id },
      update: {
        enabled: data.enabled ?? undefined,
        frequency: data.frequency ?? undefined,
        preferredDays: data.preferredDays ?? undefined,
        preferredTime: data.preferredTime ?? undefined,
        rotationLinks: data.rotationLinks ?? undefined,
        postTopics: data.postTopics ?? undefined,
        includePromo: data.includePromo ?? undefined,
        includePhone: data.includePhone ?? undefined,
        useAiGeneratedImages: data.useAiGeneratedImages ?? undefined,
      },
      create: {
        clientId: id,
        enabled: data.enabled ?? false,
        frequency: data.frequency ?? 'WEEKLY',
        preferredDays: data.preferredDays ?? [1, 4],
        preferredTime: data.preferredTime ?? '10:00',
        rotationLinks: data.rotationLinks ?? null,
        postTopics: data.postTopics ?? [],
        includePromo: data.includePromo ?? true,
        includePhone: data.includePhone ?? true,
        useAiGeneratedImages: data.useAiGeneratedImages ?? false,
      },
    })

    return NextResponse.json({
      ...config,
      googleAccessToken: undefined,
      googleRefreshToken: undefined,
    })
  } catch (error) {
    console.error('Failed to update GBP config:', error)
    return NextResponse.json({ error: 'Failed to update GBP config' }, { status: 500 })
  }
}
