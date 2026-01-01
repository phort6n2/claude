import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSetting } from '@/lib/settings'

/**
 * POST /api/webhooks/late/register - Register our webhook with Late
 *
 * This creates a webhook in Late that will notify us of post status changes.
 * Call this once after deployment to set up the webhook.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const apiKey = process.env.GETLATE_API_KEY ||
      await getSetting('GETLATE_API_KEY') ||
      await getSetting('LATE_API_KEY')

    if (!apiKey) {
      return NextResponse.json({ error: 'GETLATE_API_KEY not configured' }, { status: 400 })
    }

    // Get the base URL from the request or environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      request.headers.get('origin') ||
      'https://your-domain.com'

    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/late`

    // Check if webhook already exists
    const listResponse = await fetch('https://getlate.dev/api/v1/webhooks/settings', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (listResponse.ok) {
      const listData = await listResponse.json()
      const existingWebhook = listData.webhooks?.find(
        (w: { url: string }) => w.url === webhookUrl
      )

      if (existingWebhook) {
        return NextResponse.json({
          success: true,
          message: 'Webhook already registered',
          webhook: existingWebhook,
        })
      }
    }

    // Create the webhook
    const webhookSecret = process.env.LATE_WEBHOOK_SECRET || crypto.randomUUID()

    const response = await fetch('https://getlate.dev/api/v1/webhooks/settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Auto Glass Content Platform',
        url: webhookUrl,
        secret: webhookSecret,
        events: [
          'post.scheduled',
          'post.published',
          'post.failed',
          'post.partial',
        ],
        isActive: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to register Late webhook:', error)
      return NextResponse.json({ error: `Failed to register webhook: ${error}` }, { status: 500 })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: 'Webhook registered successfully',
      webhook: data.webhook,
      note: webhookSecret !== process.env.LATE_WEBHOOK_SECRET
        ? `Add LATE_WEBHOOK_SECRET=${webhookSecret} to your environment variables for signature verification`
        : undefined,
    })
  } catch (error) {
    console.error('Webhook registration error:', error)
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 })
  }
}

/**
 * GET /api/webhooks/late/register - List current Late webhooks
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const apiKey = process.env.GETLATE_API_KEY ||
      await getSetting('GETLATE_API_KEY') ||
      await getSetting('LATE_API_KEY')

    if (!apiKey) {
      return NextResponse.json({ error: 'GETLATE_API_KEY not configured' }, { status: 400 })
    }

    const response = await fetch('https://getlate.dev/api/v1/webhooks/settings', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error: `Failed to list webhooks: ${error}` }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Webhook list error:', error)
    return NextResponse.json({ error: 'Failed to list webhooks' }, { status: 500 })
  }
}
