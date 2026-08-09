import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * One-off setup for the ClientLocation table (multi-shop clients).
 *
 * The production database URLs are integration-managed and read-only in the
 * Vercel dashboard, so there is no psql to point at them. This runs the exact
 * statements in docs/db-setup-client-locations.sql from inside the app.
 *
 * It cannot use the app's own client. Prisma Postgres hands out two URLs and
 * the app deliberately runs on the POOLED one (PRISMA_DATABASE_URL) — that
 * role has no rights on schema public, so DDL through it comes back as
 * "permission denied for schema public" (42501). The DIRECT URL's role
 * (prisma_migration) is the one that owns the schema; it has a small
 * connection cap, which is fine for a single short-lived client we disconnect
 * immediately.
 *
 * The table is then read back through the POOLED client, because "the
 * migration role created it" and "the app can see it" are two different
 * claims and only the second one matters.
 *
 * Admin session required — no shared key, so nothing needs to be handed
 * around. Idempotent (IF NOT EXISTS throughout), so running it twice is a
 * no-op. Delete this route once every environment has it, the way the other
 * one-off migration routes were deleted.
 */

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ClientLocation" (
     "id"             TEXT NOT NULL,
     "clientId"       TEXT NOT NULL,
     "label"          TEXT NOT NULL,
     "streetAddress"  TEXT NOT NULL,
     "city"           TEXT NOT NULL,
     "state"          TEXT NOT NULL,
     "postalCode"     TEXT NOT NULL,
     "country"        TEXT NOT NULL DEFAULT 'US',
     "phone"          TEXT,
     "hours"          TEXT,
     "googlePlaceId"  TEXT,
     "googleMapsUrl"  TEXT,
     "gbpPlaceName"   TEXT,
     "gbpRating"      DOUBLE PRECISION,
     "gbpReviewCount" INTEGER,
     "gbpFetchedAt"   TIMESTAMP(3),
     "gbpLastError"   TEXT,
     "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
     "sortOrder"      INTEGER NOT NULL DEFAULT 0,
     "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"      TIMESTAMP(3) NOT NULL,
     CONSTRAINT "ClientLocation_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "ClientLocation_clientId_fkey"
       FOREIGN KEY ("clientId") REFERENCES "Client"("id")
       ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS "ClientLocation_clientId_idx" ON "ClientLocation"("clientId")`,
]

export async function GET() {
  return run()
}

export async function POST() {
  return run()
}

async function run() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  // The direct URL. DIRECT_URL is what schema.prisma names it; in this
  // project's Vercel environment the same direct connection string is the one
  // sitting in DATABASE_URL (the app itself runs on PRISMA_DATABASE_URL).
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!directUrl || directUrl.startsWith('prisma')) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No direct database URL available. DDL needs DIRECT_URL (or a non-pooled DATABASE_URL); the pooled prisma+postgres:// role cannot create tables.',
      },
      { status: 500 }
    )
  }

  const applied: string[] = []
  const ddl = new PrismaClient({ datasourceUrl: directUrl })
  try {
    for (const statement of STATEMENTS) {
      await ddl.$executeRawUnsafe(statement)
      applied.push(statement.trim().split('\n')[0].trim())
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('setup-client-locations DDL failed:', message)
    return NextResponse.json({ ok: false, applied, error: message }, { status: 500 })
  } finally {
    // The migration role's connection cap is small; don't hold one open.
    await ddl.$disconnect().catch(() => {})
  }

  try {
    // Read through the pooled client the app actually uses. If this succeeds,
    // the table exists AND the runtime role can see it.
    const count = await prisma.clientLocation.count()
    return NextResponse.json({
      ok: true,
      applied,
      shopRows: count,
      message: 'ClientLocation is ready. The Shops card on the Business tab will now save.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('setup-client-locations verify failed:', message)
    return NextResponse.json(
      {
        ok: false,
        applied,
        error: `Table created, but the app's pooled connection cannot read it: ${message}`,
      },
      { status: 500 }
    )
  }
}
