import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

async function getApiKey(key: string): Promise<string | null> {
  // First check database
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
  // Fall back to environment variable
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
      return { success: true, message: 'Connected successfully' }
    }
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGooglePlaces(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    // Test the Places API with a simple autocomplete query
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=test&key=${apiKey}`
    )

    if (response.ok) {
      const data = await response.json()
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        return { success: true, message: 'Connected successfully' }
      }
      if (data.status === 'REQUEST_DENIED') {
        return { success: false, message: data.error_message || 'API key not authorized for Places API' }
      }
      return { success: false, message: `API error: ${data.status}` }
    }

    return { success: false, message: `HTTP error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key, value } = await request.json()

  // Use provided value or fetch from database/env
  let apiKey = value
  if (!apiKey) {
    apiKey = await getApiKey(key)
  }

  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'No API key configured' })
  }

  let result: { success: boolean; message: string }

  switch (key) {
    case 'ANTHROPIC_API_KEY':
      result = await testAnthropic(apiKey)
      break
    case 'GOOGLE_PLACES_API_KEY':
      result = await testGooglePlaces(apiKey)
      break
    default:
      result = { success: false, message: 'Unknown setting key' }
  }

  return NextResponse.json(result)
}
