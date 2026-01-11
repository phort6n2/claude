import { NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/auth/session
 * Get current session info
 */
export async function GET() {
  try {
    const session = await getPortalSession()

    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      )
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        clientId: session.clientId,
        businessName: session.businessName,
        logoUrl: session.logoUrl,
      },
    })
  } catch (error) {
    console.error('[Portal Auth] Session check error:', error)
    return NextResponse.json(
      { authenticated: false, error: 'Session error' },
      { status: 500 }
    )
  }
}
