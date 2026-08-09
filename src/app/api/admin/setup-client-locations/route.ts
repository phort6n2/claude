import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * One-off setup for the ClientLocation table (multi-shop clients).
 *
 * The production DATABASE_URL is integration-managed and read-only in the
 * Vercel dashboard, so there is no psql to point at it. This runs the exact
 * statements in docs/db-setup-client-locations.sql, in the same transaction
 * shape, from inside the app that already holds the connection.
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

  const applied: string[] = []
  try {
    for (const statement of STATEMENTS) {
      await prisma.$executeRawUnsafe(statement)
      applied.push(statement.trim().split('\n')[0].trim())
    }
    // Prove it: if this count succeeds, the table is really there and the
    // Prisma client can see it.
    const count = await prisma.clientLocation.count()
    return NextResponse.json({
      ok: true,
      applied,
      shopRows: count,
      message: 'ClientLocation is ready. The Shops card on the Business tab will now save.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('setup-client-locations failed:', message)
    return NextResponse.json({ ok: false, applied, error: message }, { status: 500 })
  }
}
