import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

interface IntegrationStatus {
  name: string
  key: string
  configured: boolean
  status: 'connected' | 'error' | 'not_configured' | 'testing'
  message: string
  lastTested?: string
}

async function getApiKey(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } })
  if (setting) {
    if (setting.encrypted) {
      try {
        return decrypt(setting.value)
      } catch {
        return null
      }
    }
    return setting.value
  }
  return process.env[key] || null
}

async function testAnthropic(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })
    if (response.ok) {
      return { success: true, message: 'Connected' }
    }
    if (response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testDeepgram(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
    })
    if (response.ok) {
      return { success: true, message: 'Connected' }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGooglePlaces(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=test&key=${apiKey}`
    )
    if (response.ok) {
      const data = await response.json()
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        return { success: true, message: 'Connected' }
      }
      if (data.status === 'REQUEST_DENIED') {
        return { success: false, message: 'API key not authorized' }
      }
      return { success: false, message: `Error: ${data.status}` }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

// GET - Return status of all integrations (quick check, no live testing)
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const integrations: IntegrationStatus[] = [
    {
      name: 'Claude (Anthropic)',
      key: 'ANTHROPIC_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'Deepgram (Transcription)',
      key: 'DEEPGRAM_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'Google Places',
      key: 'GOOGLE_PLACES_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
  ]

  // Check which integrations are configured
  for (const integration of integrations) {
    const apiKey = await getApiKey(integration.key)
    if (apiKey) {
      integration.configured = true
      integration.status = 'connected'
      integration.message = 'Configured (not tested)'
    }
  }

  return NextResponse.json({ integrations })
}

// POST - Test a specific integration
export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key } = await request.json()

  const apiKey = await getApiKey(key)
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      message: 'Not configured',
      status: 'not_configured',
    })
  }

  let result: { success: boolean; message: string }

  switch (key) {
    case 'ANTHROPIC_API_KEY':
      result = await testAnthropic(apiKey)
      break
    case 'DEEPGRAM_API_KEY':
      result = await testDeepgram(apiKey)
      break
    case 'GOOGLE_PLACES_API_KEY':
      result = await testGooglePlaces(apiKey)
      break
    default:
      result = { success: false, message: 'Unknown integration' }
  }

  return NextResponse.json({
    ...result,
    status: result.success ? 'connected' : 'error',
    lastTested: new Date().toISOString(),
  })
}
