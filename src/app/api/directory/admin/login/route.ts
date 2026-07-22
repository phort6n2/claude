import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifyAdminLogin, makeAdminToken, adminConfigured } from '@/lib/directory/admin-auth'

// Admin sign-in.
//   POST { email, password } → validate + set the admin session cookie
//   DELETE                    → sign out
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: 'Admin login isn’t set up yet — set DIRECTORY_ADMIN_PASSWORD.' },
      { status: 400 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '')
  const password = String(body?.password ?? '')
  const admin = verifyAdminLogin(email, password)
  if (!admin) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, makeAdminToken(admin), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
