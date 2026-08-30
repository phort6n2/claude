import { NextRequest, NextResponse } from 'next/server'
import { createMagicLink } from '@/lib/portal-auth'
import { portalVerifyUrl, sendMagicLinkEmail } from '@/lib/portal-email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/auth/request-link — email a sign-in link.
 *
 * The response is the same whether the address exists or not. This endpoint
 * is reachable without a session, so a distinguishable "no account found" is
 * a directory of which shops use the platform, one guess at a time. The
 * person who owns the address learns the truth from their inbox.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const neutral = NextResponse.json({
      success: true,
      message: 'If that address has a portal account, a sign-in link is on its way.',
    })

    const result = await createMagicLink(email.toLowerCase().trim())
    if (!result.success || !result.token) return neutral

    const sent = await sendMagicLinkEmail({
      to: email.toLowerCase().trim(),
      businessName: result.clientUser?.client.businessName || 'your shop',
      url: portalVerifyUrl(result.token),
    })
    if (!sent.ok) {
      // A real account whose email cannot be sent IS worth distinguishing —
      // this failure is ours, not the guesser's, and "check your inbox" for a
      // message that never left would strand the one legitimate caller.
      console.error('[Portal Auth] Magic link email failed:', sent.error)
      return NextResponse.json(
        { error: 'We could not send the email just now. Try again in a minute.' },
        { status: 502 }
      )
    }

    return neutral
  } catch (error) {
    console.error('[Portal Auth] Request link error:', error)
    return NextResponse.json({ error: 'Failed to send login link' }, { status: 500 })
  }
}
