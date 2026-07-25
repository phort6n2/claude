import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdmin, ADMIN_COOKIE, verifyAdminToken } from '@/lib/directory/admin-auth'
import { sendTestEmail } from '@/lib/directory/notify'

// Admin-only: send a test email so a misconfigured key or unverified sending
// domain surfaces immediately, instead of silently swallowing real lead alerts.
// Defaults to the signed-in admin's address, then DIRECTORY_NOTIFY_EMAIL.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const adminEmail = verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value)
  const body = await request.json().catch(() => ({}))
  const to = String(body?.to || adminEmail || process.env.DIRECTORY_NOTIFY_EMAIL || '').trim()

  if (!to) {
    return NextResponse.json(
      { error: 'No address to send to — set DIRECTORY_NOTIFY_EMAIL or sign in as an admin.' },
      { status: 400 }
    )
  }

  const result = await sendTestEmail(to)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, to }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to })
}
