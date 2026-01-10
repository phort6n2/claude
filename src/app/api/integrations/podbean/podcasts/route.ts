import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

interface PodbeanPodcast {
  id: string
  title: string
  logo: string
  description: string
  website: string
}

async function getPodbeanCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const clientIdSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_ID' } })
  const clientSecretSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_SECRET' } })

  if (!clientIdSetting || !clientSecretSetting) {
    return null
  }

  const clientId = clientIdSetting.encrypted ? decrypt(clientIdSetting.value) : clientIdSetting.value
  const clientSecret = clientSecretSetting.encrypted ? decrypt(clientSecretSetting.value) : clientSecretSetting.value

  // Handle case where decryption fails
  if (!clientId || !clientSecret) {
    return null
  }

  return { clientId, clientSecret }
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://api.podbean.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error('Failed to authenticate with Podbean')
  }

  const data = await response.json()
  return data.access_token
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const credentials = await getPodbeanCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Podbean credentials not configured', connected: false },
        { status: 400 }
      )
    }

    const accessToken = await getAccessToken(credentials.clientId, credentials.clientSecret)

    // Get all podcasts for the account
    const response = await fetch(
      `https://api.podbean.com/v1/podcasts?access_token=${accessToken}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: `Podbean API error: ${error}`, connected: true },
        { status: 500 }
      )
    }

    const data = await response.json()

    // Podbean returns an array of podcasts
    const podcasts: PodbeanPodcast[] = (data.podcasts || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      title: p.title as string,
      logo: p.logo as string || '',
      description: (p.desc as string) || '',
      website: (p.website as string) || '',
    }))

    return NextResponse.json({
      connected: true,
      podcasts,
    })
  } catch (error) {
    console.error('Failed to fetch Podbean podcasts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch podcasts', connected: false },
      { status: 500 }
    )
  }
}
