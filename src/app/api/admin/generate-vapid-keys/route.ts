import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/generate-vapid-keys?key=glassleads2024
 * Generates new VAPID keys for push notifications
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'glassleads2024') {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  try {
    const vapidKeys = webpush.generateVAPIDKeys()

    return NextResponse.json({
      success: true,
      message: 'Copy these keys to your environment variables',
      keys: {
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapidKeys.publicKey,
        VAPID_PRIVATE_KEY: vapidKeys.privateKey,
      },
      instructions: [
        '1. Copy the keys above to your environment variables',
        '2. Redeploy your app',
        '3. Users will need to re-enable notifications (old subscriptions won\'t work)',
      ],
    })
  } catch (error) {
    console.error('Failed to generate VAPID keys:', error)
    return NextResponse.json(
      { error: 'Failed to generate keys', details: String(error) },
      { status: 500 }
    )
  }
}
