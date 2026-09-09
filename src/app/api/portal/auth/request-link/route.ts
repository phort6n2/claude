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

    const addr = email.toLowerCase().trim()

    const result = await createMagicLink(addr)
    if (!result.success || !result.token) {
      /* LOGGED, THOUGH THE ANSWER IS THE SAME.
         The neutral RESPONSE is what stops this endpoint being a directory of
         who uses the platform — an attacker reads the response, not our logs.
         So saying nothing here bought no security at all, and cost the one
         fact that settles "they never got the email": whether we ever had an
         account to send it to. A shop owner typing the address THEY use
         instead of the one on the account gets a cheerful "check your inbox"
         and nothing arrives, and until now that was indistinguishable from a
         delivery failure. */
      console.log(`[Portal Auth] Sign-in link requested for ${addr} — NO ACCOUNT, nothing sent`)
      return neutral
    }

    const sent = await sendMagicLinkEmail({
      to: addr,
      businessName: result.clientUser?.client.businessName || 'your shop',
      url: portalVerifyUrl(result.token),
    })
    if (!sent.ok) {
      // A real account whose email cannot be sent IS worth distinguishing —
      // this failure is ours, not the guesser's, and "check your inbox" for a
      // message that never left would strand the one legitimate caller.
      console.error(`[Portal Auth] Magic link to ${addr} FAILED: ${sent.error}`)
      return NextResponse.json(
        { error: 'We could not send the email just now. Try again in a minute.' },
        { status: 502 }
      )
    }

    console.log(`[Portal Auth] Sign-in link sent to ${addr}`)
    return neutral
  } catch (error) {
    console.error('[Portal Auth] Request link error:', error)
    return NextResponse.json({ error: 'Failed to send login link' }, { status: 500 })
  }
}
