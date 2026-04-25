import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-shot migration to create the CallAnalysis table + enum.
 *
 * The app uses Prisma Postgres which doesn't expose a SQL console in its
 * dashboard, and the deploy pipeline doesn't run prisma migrate. This route
 * runs the DDL idempotently so a non-technical operator can apply the schema
 * change by visiting a URL.
 *
 * Auth: ?secret=$CRON_SECRET as a query param (so it's openable in a browser).
 *
 * Idempotent — safe to hit more than once. After the table exists this
 * effectively becomes a no-op that returns { alreadyExists: true }.
 */
async function runMigration() {
  const statements: string[] = [
    // Enum (no CREATE TYPE IF NOT EXISTS in Postgres — use a DO block).
    `DO $$ BEGIN
       CREATE TYPE "CallAnalysisStatus" AS ENUM (
         'PENDING', 'DOWNLOADING', 'TRANSCRIBING', 'ANALYZING', 'COMPLETE', 'FAILED'
       );
     EXCEPTION
       WHEN duplicate_object THEN null;
     END $$;`,

    `CREATE TABLE IF NOT EXISTS "CallAnalysis" (
       "id" TEXT NOT NULL,
       "clientId" TEXT NOT NULL,
       "leadId" TEXT,
       "highlevelCallId" TEXT,
       "highlevelContactId" TEXT,
       "recordingUrl" TEXT,
       "durationSeconds" INTEGER,
       "callDirection" TEXT,
       "callerPhone" TEXT,
       "repPhone" TEXT,
       "status" "CallAnalysisStatus" NOT NULL DEFAULT 'PENDING',
       "errorMessage" TEXT,
       "transcript" JSONB,
       "audioMetrics" JSONB,
       "analysis" JSONB,
       "score" INTEGER,
       "outcome" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL,
       "completedAt" TIMESTAMP(3),
       CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
     );`,

    `CREATE INDEX IF NOT EXISTS "CallAnalysis_clientId_createdAt_idx"
       ON "CallAnalysis"("clientId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "CallAnalysis_status_idx"
       ON "CallAnalysis"("status");`,
    `CREATE INDEX IF NOT EXISTS "CallAnalysis_leadId_idx"
       ON "CallAnalysis"("leadId");`,
    `CREATE INDEX IF NOT EXISTS "CallAnalysis_clientId_score_idx"
       ON "CallAnalysis"("clientId", "score");`,

    // FKs need DO-block guards because ADD CONSTRAINT has no IF NOT EXISTS.
    `DO $$ BEGIN
       ALTER TABLE "CallAnalysis"
         ADD CONSTRAINT "CallAnalysis_clientId_fkey"
         FOREIGN KEY ("clientId") REFERENCES "Client"("id")
         ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION
       WHEN duplicate_object THEN null;
     END $$;`,

    `DO $$ BEGIN
       ALTER TABLE "CallAnalysis"
         ADD CONSTRAINT "CallAnalysis_leadId_fkey"
         FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
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
      const message = err instanceof Error ? err.message : String(err)
      results.push({ statement: stmt.split('\n')[0].trim(), ok: false, error: message })
    }
  }

  // Sanity-check: try a trivial select against the new table.
  let verified = false
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "CallAnalysis" LIMIT 1;`)
    verified = true
  } catch {
    verified = false
  }

  return { results, verified }
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const fromHeader = req.headers.get('authorization')
  if (fromHeader === `Bearer ${secret}`) return true

  const fromQuery = new URL(req.url).searchParams.get('secret')
  if (fromQuery === secret) return true

  return false
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runMigration()
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runMigration()
  return NextResponse.json(result)
}
