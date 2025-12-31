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
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })
    if (response.ok) {
      return { success: true, message: 'Connected successfully' }
    }
    const error = await response.text()
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testNanoBanana(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    // Test Google AI Studio / Imagen API by listing models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    )
    if (response.ok) {
      const data = await response.json()
      // Check if Imagen model is available
      const hasImagen = data.models?.some((m: { name: string }) =>
        m.name.includes('imagen')
      )
      return {
        success: true,
        message: hasImagen ? 'Connected - Imagen available' : 'Connected - check Imagen access'
      }
    }
    if (response.status === 400 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testAutocontent(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    // Use the status endpoint with a dummy ID - 401 means bad key, 404 means key works
    const response = await fetch('https://api.autocontentapi.com/content/Status/test', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    // 404 or 400 means the key is valid but request ID doesn't exist (expected)
    if (response.ok || response.status === 404 || response.status === 400) {
      return { success: true, message: 'Connected successfully' }
    }
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testCreatify(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.creatify.ai/v1/account', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (response.ok) {
      return { success: true, message: 'Connected successfully' }
    }
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGetlate(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.getlate.dev/v1/account', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (response.ok) {
      return { success: true, message: 'Connected successfully' }
    }
    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGoogleCloud(projectId: string, credentials: string): Promise<{ success: boolean; message: string }> {
  try {
    // Parse credentials to validate JSON
    const creds = JSON.parse(credentials)
    if (!creds.project_id || !creds.private_key) {
      return { success: false, message: 'Invalid credentials format' }
    }
    // For now, just validate the JSON structure
    return { success: true, message: 'Credentials format valid' }
  } catch (error) {
    return { success: false, message: 'Invalid JSON format' }
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
    case 'NANO_BANANA_API_KEY':
      result = await testNanoBanana(apiKey)
      break
    case 'AUTOCONTENT_API_KEY':
      result = await testAutocontent(apiKey)
      break
    case 'CREATIFY_API_KEY':
      result = await testCreatify(apiKey)
      break
    case 'GETLATE_API_KEY':
      result = await testGetlate(apiKey)
      break
    case 'GOOGLE_CLOUD_CREDENTIALS':
      result = await testGoogleCloud(
        await getApiKey('GOOGLE_CLOUD_PROJECT_ID') || '',
        apiKey
      )
      break
    case 'GOOGLE_CLOUD_PROJECT_ID':
    case 'GOOGLE_CLOUD_STORAGE_BUCKET':
      // These are just config values, not testable APIs
      result = { success: true, message: 'Configuration value saved' }
      break
    default:
      result = { success: false, message: 'Unknown setting key' }
  }

  return NextResponse.json(result)
}
