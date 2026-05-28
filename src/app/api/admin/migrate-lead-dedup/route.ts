import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-shot migration to add Lead.duplicateOfLeadId for same-day deduplication.
 *
 * Auth: ?secret=$CRON_SECRET. Idempotent.
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
    `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "duplicateOfLeadId" TEXT;`,
    `CREATE INDEX IF NOT EXISTS "Lead_duplicateOfLeadId_idx"
       ON "Lead"("duplicateOfLeadId");`,
    `CREATE INDEX IF NOT EXISTS "Lead_clientId_phone_createdAt_idx"
       ON "Lead"("clientId", "phone", "createdAt");`,
    // FK guarded by DO block since ADD CONSTRAINT has no IF NOT EXISTS.
    `DO $$ BEGIN
       ALTER TABLE "Lead"
         ADD CONSTRAINT "Lead_duplicateOfLeadId_fkey"
         FOREIGN KEY ("duplicateOfLeadId") REFERENCES "Lead"("id")
         ON DELETE SET NULL ON UPDATE CASCADE;
     EXCEPTION
       WHEN duplicate_object THEN null;
     END $$;`,
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

  let verified = false
  try {
    await prisma.$queryRawUnsafe(
      `SELECT "duplicateOfLeadId" FROM "Lead" LIMIT 1;`
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
