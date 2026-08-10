import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { ALL_KEYS } from '@/lib/setting-keys'

export const dynamic = 'force-dynamic'

/**
 * Show one stored credential in the clear, to the admin who stored it.
 *
 * The list endpoint deliberately never sends sensitive values to the browser,
 * which is right for a page that loads thirteen of them at once. But there
 * are moments when you genuinely need the value back — pasting the OAuth
 * client ID and secret into Google's playground to mint a refresh token is
 * the obvious one — and "re-create the credential because you can't read the
 * one you saved" is a bad answer.
 *
 * So this is deliberately narrow: one key per request, named explicitly, on a
 * POST so it can't be linked to or landed on from a browser history entry,
 * and never cached anywhere.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key : ''
  // Allow-list, not a free lookup. Setting holds more than API credentials,
  // and an endpoint that decrypts any row by name is a different, worse thing
  // than one that reveals a known credential.
  if (!ALL_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown setting' }, { status: 400 })
  }

  const setting = await prisma.setting.findUnique({ where: { key } })
  if (!setting) {
    // Env-var-backed values are not ours to hand out — they live in Vercel,
    // and that is where they can be read.
    return NextResponse.json(
      {
        error: process.env[key]
          ? 'This one comes from an environment variable, so read it in Vercel → Settings → Environment Variables.'
          : 'Nothing saved for this key.',
      },
      { status: 404 }
    )
  }

  let value = setting.value
  if (setting.encrypted) {
    const decrypted = decrypt(setting.value)
    if (decrypted === null) {
      return NextResponse.json(
        { error: 'Could not decrypt — ENCRYPTION_KEY has changed since this was saved. Re-enter it.' },
        { status: 500 }
      )
    }
    value = decrypted
  }

  return NextResponse.json(
    { value },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
  )
}
