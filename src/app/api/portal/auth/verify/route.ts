import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink, createPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/auth/verify — { token }
 *
 * What the /portal/auth/verify PAGE actually calls. It was calling this with
 * only the GET below defined, so every magic link ended in a 405 — found the
 * first time the walkthrough tried to sign a shop in with one.
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json().catch(() => ({ token: null }))
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid or missing login link' }, { status: 400 })
    }

    const result = await verifyMagicLink(token)
    if (!result.success || !result.clientUser) {
      return NextResponse.json(
        { success: false, error: result.error || 'This link has expired — request a fresh one at the login page.' },
        { status: 401 }
      )
    }

    await createPortalSession(result.clientUser.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Portal Auth] Verify error:', error)
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 })
  }
}

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
