import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink, createPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/auth/verify?token=xxx
 * Verify magic link and create session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.redirect(new URL('/portal/login?error=missing_token', request.url))
    }

    const result = await verifyMagicLink(token)

    if (!result.success || !result.clientUser) {
      const errorParam = encodeURIComponent(result.error || 'Invalid link')
      return NextResponse.redirect(new URL(`/portal/login?error=${errorParam}`, request.url))
    }

    // Create session
    await createPortalSession(result.clientUser.id)

    // Redirect to portal
    return NextResponse.redirect(new URL('/portal/leads', request.url))
  } catch (error) {
    console.error('[Portal Auth] Verify error:', error)
    return NextResponse.redirect(new URL('/portal/login?error=verification_failed', request.url))
  }
}
