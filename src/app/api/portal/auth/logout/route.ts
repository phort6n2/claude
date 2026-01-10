import { NextResponse } from 'next/server'
import { clearPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/auth/logout
 * Clear session and logout
 */
export async function POST() {
  try {
    await clearPortalSession()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Portal Auth] Logout error:', error)
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
}
