import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-shot migration to add Client.callCoachingEnabled.
 *
 * Mirrors the pattern of /api/admin/migrate-call-analysis. Idempotent —
 * uses ADD COLUMN IF NOT EXISTS so it's safe to hit more than once.
 *
 * Auth: ?secret=$CRON_SECRET (browser-friendly).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (new URL(req.url).searchParams.get('secret') === secret) return true
  return false
}

async function runMigration() {
  const statements: string[] = [
    `ALTER TABLE "Client"
       ADD COLUMN IF NOT EXISTS "callCoachingEnabled" BOOLEAN NOT NULL DEFAULT true;`,
  ]

  const results: Array<{ statement: string; ok: boolean; error?: string }> = []
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt)
      results.push({ statement: stmt.split('\n')[0].trim(), ok: true })
    } catch (err) {
      results.push({
        statement: stmt.split('\n')[0].trim(),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Verify by reading the column on any one row.
  let verified = false
  try {
    await prisma.$queryRawUnsafe(
      `SELECT "callCoachingEnabled" FROM "Client" LIMIT 1;`
    )
    verified = true
  } catch {
    verified = false
  }

  return { results, verified }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runMigration())
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runMigration())
}
