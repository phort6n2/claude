import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getWRHQConfig } from '@/lib/settings'

async function testWordPressConnection(url: string, username: string, password: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    // Normalize URL
    const baseUrl = url.replace(/\/$/, '')
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1`

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
    })

    if (response.ok) {
      return { success: true, message: 'Connected successfully' }
    }

    if (response.status === 401) {
      return { success: false, message: 'Invalid credentials' }
    }

    if (response.status === 404) {
      return { success: false, message: 'WordPress REST API not found - check URL' }
    }

    return { success: false, message: `API error: ${response.status}` }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { type, data } = await request.json()

    if (type === 'wordpress') {
      // Get current config to fill in missing values
      const config = await getWRHQConfig()

      const url = data?.url || config.wordpress.url
      const username = data?.username || config.wordpress.username
      // Use provided password or fall back to stored (if not masked)
      const password = (data?.appPassword && data.appPassword !== '••••••••')
        ? data.appPassword
        : config.wordpress.appPassword

      if (!url || !username || !password) {
        return NextResponse.json({
          success: false,
          message: 'WordPress URL, username, and password are required',
        })
      }

      const result = await testWordPressConnection(url, username, password)
      return NextResponse.json(result)
    }

    return NextResponse.json(
      { success: false, message: 'Unknown test type' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Test failed:', error)
    return NextResponse.json(
      { success: false, message: 'Test failed' },
      { status: 500 }
    )
  }
}
