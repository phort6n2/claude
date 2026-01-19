import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/podbean-podcasts
 *
 * Lists all Podbean podcasts available in the account and shows which clients
 * are assigned to each. Helps diagnose and fix podcast assignment issues.
 */
export async function GET() {
  try {
    // Get Podbean credentials
    const { decrypt } = await import('@/lib/encryption')
    const clientIdSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_ID' } })
    const clientSecretSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_SECRET' } })

    if (!clientIdSetting || !clientSecretSetting) {
      return NextResponse.json({ error: 'Podbean credentials not configured' }, { status: 400 })
    }

    const clientId = clientIdSetting.encrypted ? decrypt(clientIdSetting.value) : clientIdSetting.value
    const clientSecret = clientSecretSetting.encrypted ? decrypt(clientSecretSetting.value) : clientSecretSetting.value

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Failed to decrypt Podbean credentials' }, { status: 400 })
    }

    // Get access token
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenResponse = await fetch('https://api.podbean.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      return NextResponse.json({ error: `Podbean auth failed: ${error}` }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get podcasts list
    const podcastsResponse = await fetch(
      `https://api.podbean.com/v1/podcasts?access_token=${accessToken}`,
      { method: 'GET' }
    )

    if (!podcastsResponse.ok) {
      const error = await podcastsResponse.text()
      return NextResponse.json({ error: `Failed to get podcasts: ${error}` }, { status: 500 })
    }

    const podcastsData = await podcastsResponse.json()
    const podcasts = podcastsData.podcasts || []

    // Get all clients and their current podcast assignments
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        businessName: true,
        podbeanPodcastId: true,
        podbeanPodcastTitle: true,
      },
      orderBy: { businessName: 'asc' },
    })

    // Build mapping of podcast ID to clients
    const podcastToClients: Record<string, string[]> = {}
    const unassignedClients: typeof clients = []

    for (const client of clients) {
      if (client.podbeanPodcastId) {
        if (!podcastToClients[client.podbeanPodcastId]) {
          podcastToClients[client.podbeanPodcastId] = []
        }
        podcastToClients[client.podbeanPodcastId].push(client.businessName)
      } else {
        unassignedClients.push(client)
      }
    }

    // Format response
    const podcastList = podcasts.map((p: { id: string; title: string; logo?: string }) => ({
      id: p.id,
      title: p.title,
      logo: p.logo,
      assignedClients: podcastToClients[p.id] || [],
    }))

    return NextResponse.json({
      success: true,
      podcasts: podcastList,
      clients: clients.map(c => ({
        id: c.id,
        businessName: c.businessName,
        podbeanPodcastId: c.podbeanPodcastId,
        podbeanPodcastTitle: c.podbeanPodcastTitle,
        status: c.podbeanPodcastId ? 'assigned' : 'NOT ASSIGNED - will publish to default podcast!',
      })),
      unassignedClients: unassignedClients.map(c => c.businessName),
      instructions: {
        step1: 'Find the podcast ID for each client from the podcasts list above',
        step2: 'Use PATCH /api/admin/podbean-podcasts to assign podcast IDs to clients',
        example: 'PATCH with body: { "clientId": "xxx", "podcastId": "yyy", "podcastTitle": "Podcast Name" }',
      },
    })
  } catch (error) {
    console.error('[PodcastsList] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/podbean-podcasts
 *
 * Update a client's Podbean podcast assignment.
 * Body: { clientId: string, podcastId: string, podcastTitle?: string }
 */
export async function PATCH(request: Request) {
  try {
    const { clientId, podcastId, podcastTitle } = await request.json()

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    if (!podcastId) {
      return NextResponse.json({ error: 'podcastId is required' }, { status: 400 })
    }

    // Update the client
    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        podbeanPodcastId: podcastId,
        podbeanPodcastTitle: podcastTitle || null,
      },
      select: {
        id: true,
        businessName: true,
        podbeanPodcastId: true,
        podbeanPodcastTitle: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedClient.businessName} to use podcast ${podcastId}`,
      client: updatedClient,
    })
  } catch (error) {
    console.error('[PodcastsUpdate] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
