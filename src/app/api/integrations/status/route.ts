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
        model: 'claude-3-haiku-20240307',
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

async function testNanoBanana(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    )
    if (response.ok) {
      return { success: true, message: 'Connected - Gemini available' }
    }
    if (response.status === 400 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testAutocontent(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.autocontentapi.com/content/Status/test', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    if (response.ok || response.status === 404 || response.status === 400) {
      return { success: true, message: 'Connected' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGetlate(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://getlate.dev/api/v1/profiles', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (response.ok) {
      const data = await response.json()
      const profileCount = data.data?.length || 0
      return { success: true, message: `Connected - ${profileCount} profile${profileCount !== 1 ? 's' : ''}` }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testPodbean(clientId: string, clientSecret: string): Promise<{ success: boolean; message: string }> {
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const response = await fetch('https://api.podbean.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AutoGlassContentPlatform/1.0',
      },
      body: 'grant_type=client_credentials',
    })
    if (response.ok) {
      const data = await response.json()
      if (data.access_token) {
        return { success: true, message: 'Connected' }
      }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid credentials' }
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

async function testCreatify(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const [apiId, apiSecret] = apiKey.includes(':') ? apiKey.split(':') : [apiKey, '']
    if (!apiSecret) {
      return { success: false, message: 'Invalid format (need api_id:api_key)' }
    }
    const response = await fetch('https://api.creatify.ai/api/lipsyncs/', {
      method: 'GET',
      headers: {
        'X-API-ID': apiId,
        'X-API-KEY': apiSecret,
      },
    })
    if (response.ok) {
      return { success: true, message: 'Connected' }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid credentials' }
    }
    return { success: false, message: `Error: ${response.status}` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function testGoogleCloud(credentials: string): Promise<{ success: boolean; message: string }> {
  try {
    const creds = JSON.parse(credentials)
    if (!creds.project_id || !creds.private_key) {
      return { success: false, message: 'Invalid credentials format' }
    }
    return { success: true, message: `Project: ${creds.project_id}` }
  } catch {
    return { success: false, message: 'Invalid JSON format' }
  }
}

async function testDataForSEO(login: string, password: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
      },
    })
    if (response.ok) {
      const data = await response.json()
      const balance = data.tasks?.[0]?.result?.[0]?.money?.balance
      if (balance !== undefined) {
        return { success: true, message: `Connected - $${balance.toFixed(2)} balance` }
      }
      return { success: true, message: 'Connected' }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid credentials' }
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
      name: 'Image Generation (Gemini)',
      key: 'NANO_BANANA_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'AutoContent (Podcasts)',
      key: 'AUTOCONTENT_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'Late (Social Media)',
      key: 'GETLATE_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'Podbean (Podcast Publishing)',
      key: 'PODBEAN_CLIENT_SECRET',
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
    {
      name: 'Google Cloud Storage',
      key: 'GOOGLE_CLOUD_CREDENTIALS',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'Creatify (Video)',
      key: 'CREATIFY_API_KEY',
      configured: false,
      status: 'not_configured',
      message: 'Not configured',
    },
    {
      name: 'DataForSEO (PAA Research)',
      key: 'DATAFORSEO_PASSWORD',
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

  // Special check for Podbean (needs both client ID and secret)
  const podbeanIntegration = integrations.find(i => i.key === 'PODBEAN_CLIENT_SECRET')
  if (podbeanIntegration) {
    const clientId = await getApiKey('PODBEAN_CLIENT_ID')
    const clientSecret = await getApiKey('PODBEAN_CLIENT_SECRET')
    if (clientId && clientSecret) {
      podbeanIntegration.configured = true
      podbeanIntegration.status = 'connected'
      podbeanIntegration.message = 'Configured (not tested)'
    } else if (clientId || clientSecret) {
      podbeanIntegration.configured = false
      podbeanIntegration.status = 'error'
      podbeanIntegration.message = 'Partially configured'
    }
  }

  // Special check for DataForSEO (needs both login and password)
  const dataForSeoIntegration = integrations.find(i => i.key === 'DATAFORSEO_PASSWORD')
  if (dataForSeoIntegration) {
    const login = await getApiKey('DATAFORSEO_LOGIN')
    const password = await getApiKey('DATAFORSEO_PASSWORD')
    if (login && password) {
      dataForSeoIntegration.configured = true
      dataForSeoIntegration.status = 'connected'
      dataForSeoIntegration.message = 'Configured (not tested)'
    } else if (login || password) {
      dataForSeoIntegration.configured = false
      dataForSeoIntegration.status = 'error'
      dataForSeoIntegration.message = 'Partially configured'
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
  if (!apiKey && key !== 'PODBEAN_CLIENT_SECRET' && key !== 'DATAFORSEO_PASSWORD') {
    return NextResponse.json({
      success: false,
      message: 'Not configured',
      status: 'not_configured',
    })
  }

  let result: { success: boolean; message: string }

  switch (key) {
    case 'ANTHROPIC_API_KEY':
      result = await testAnthropic(apiKey!)
      break
    case 'NANO_BANANA_API_KEY':
      result = await testNanoBanana(apiKey!)
      break
    case 'AUTOCONTENT_API_KEY':
      result = await testAutocontent(apiKey!)
      break
    case 'GETLATE_API_KEY':
      result = await testGetlate(apiKey!)
      break
    case 'PODBEAN_CLIENT_SECRET':
      const clientId = await getApiKey('PODBEAN_CLIENT_ID')
      const clientSecret = await getApiKey('PODBEAN_CLIENT_SECRET')
      if (!clientId || !clientSecret) {
        result = { success: false, message: 'Missing client ID or secret' }
      } else {
        result = await testPodbean(clientId, clientSecret)
      }
      break
    case 'GOOGLE_PLACES_API_KEY':
      result = await testGooglePlaces(apiKey!)
      break
    case 'GOOGLE_CLOUD_CREDENTIALS':
      result = await testGoogleCloud(apiKey!)
      break
    case 'CREATIFY_API_KEY':
      result = await testCreatify(apiKey!)
      break
    case 'DATAFORSEO_PASSWORD':
      const dfLogin = await getApiKey('DATAFORSEO_LOGIN')
      const dfPassword = await getApiKey('DATAFORSEO_PASSWORD')
      if (!dfLogin || !dfPassword) {
        result = { success: false, message: 'Missing login or password' }
      } else {
        result = await testDataForSEO(dfLogin, dfPassword)
      }
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
