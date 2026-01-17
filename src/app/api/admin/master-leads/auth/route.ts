import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/master-leads/auth - Check if current user is authorized for master leads
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ authorized: false, reason: 'not_authenticated' })
  }

  // Check if user's email matches the allowed master leads email
  const allowedEmail = process.env.MASTER_LEADS_EMAIL

  if (!allowedEmail) {
    // If no email is configured, deny access
    return NextResponse.json({ authorized: false, reason: 'not_configured' })
  }

  const isAuthorized = session.user.email.toLowerCase() === allowedEmail.toLowerCase()

  return NextResponse.json({
    authorized: isAuthorized,
    reason: isAuthorized ? 'authorized' : 'not_allowed'
  })
}
