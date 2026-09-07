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
      {
        error: 'Admin login isn’t set up yet — set DIRECTORY_ADMIN_PASSWORD.',
        // Which deployment is answering, and which names it looked for.
        //
        // "The password IS set" and "this function sees no password" are both
        // true more often than they sound: this site is the `wrhq` Vercel
        // project, while the same repo also deploys as `agmp-paa-pro` for
        // glassleads.app. A variable set on the wrong project, or scoped to
        // Preview instead of Production, or added after the last build, all
        // look identical from the login screen. None of this is secret — the
        // commit and environment are already public in the deployment.
        checked: ['DIRECTORY_ADMIN_PASSWORD', 'DIRECTORY_UPLOAD_SECRET'],
        deployment: {
          environment: process.env.VERCEL_ENV ?? 'unknown',
          host: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? 'local',
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
          builtFrom: process.env.VERCEL_GIT_REPO_SLUG ?? 'unknown',
        },
      },
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
