import { NextRequest, NextResponse } from 'next/server'
import { verifyPasswordLogin, createPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/auth/login
 * Login with email and password
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const result = await verifyPasswordLogin(email, password)

    if (!result.success || !result.clientUser) {
      return NextResponse.json(
        { error: result.error || 'Login failed' },
        { status: 401 }
      )
    }

    // Create session
    await createPortalSession(result.clientUser.id)

    return NextResponse.json({
      success: true,
      user: {
        id: result.clientUser.id,
        email: result.clientUser.email,
        name: result.clientUser.name,
        clientId: result.clientUser.clientId,
        businessName: result.clientUser.client.businessName,
      },
    })
  } catch (error) {
    console.error('[Portal Auth] Login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}
