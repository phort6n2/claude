import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/vapid - Check VAPID configuration (temporary debug endpoint)
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  return NextResponse.json({
    publicKeySet: !!publicKey,
    publicKeyLength: publicKey?.length || 0,
    publicKeyPreview: publicKey ? publicKey.substring(0, 10) + '...' : null,
    privateKeySet: !!privateKey,
    privateKeyLength: privateKey?.length || 0,
    adminEmail: process.env.ADMIN_EMAIL || 'not set',
  })
}
