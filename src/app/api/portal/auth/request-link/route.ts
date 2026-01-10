import { NextRequest, NextResponse } from 'next/server'
import { createMagicLink } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/auth/request-link
 * Request a magic link to be sent to the user's email
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const result = await createMagicLink(email.toLowerCase().trim())

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    // In production, send email here
    // For now, we'll return the token for testing (REMOVE IN PRODUCTION)
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal/auth/verify?token=${result.token}`

    console.log(`[Portal Auth] Magic link for ${email}: ${loginUrl}`)

    // TODO: Send email with magic link
    // await sendEmail({
    //   to: email,
    //   subject: `Login to ${result.clientUser?.client.businessName} Lead Portal`,
    //   body: `Click here to login: ${loginUrl}`,
    // })

    return NextResponse.json({
      success: true,
      message: 'Login link sent to your email',
      // DEVELOPMENT ONLY - remove in production
      ...(process.env.NODE_ENV !== 'production' && {
        debugToken: result.token,
        debugUrl: loginUrl,
      }),
    })
  } catch (error) {
    console.error('[Portal Auth] Request link error:', error)
    return NextResponse.json(
      { error: 'Failed to send login link' },
      { status: 500 }
    )
  }
}
