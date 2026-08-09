import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Applies the pending hand-run SQL to whatever database this deployment
 * points at.
 *
 * The app runs on the POOLED Prisma Postgres role, which has no rights on
 * schema public — DDL through it fails with 42501. The DIRECT url's role
 * (prisma_migration) owns the schema, so the statements run through one
 * short-lived client on that connection which is disconnected immediately
 * (its connection cap is small).
 *
 * Every statement is IF NOT EXISTS, so running this twice is a no-op and a
 * partially-applied state resolves by running it again. Verification reads
 * each table back through the POOLED client, because "the migration role
 * created it" and "the app can see it" are different claims and only the
 * second one decides whether the feature works.
 *
 * Admin session required. Delete this route once every environment is
 * current, the way the earlier one-off migration routes were deleted.
 */

const STATEMENTS: Array<{ table: string; sql: string[] }> = [
  {
    table: 'ClientLocation',
    sql: [
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
    ],
  },
  {
    table: 'ClientAdsTracking',
    sql: [
      `CREATE TABLE IF NOT EXISTS "ClientAdsTracking" (
         "id"                  TEXT NOT NULL,
         "clientId"            TEXT NOT NULL,
         "conversionId"        TEXT,
         "leadConversionLabel" TEXT,
         "leadValue"           DOUBLE PRECISION,
         "leadCurrency"        TEXT,
         "callConversionLabel" TEXT,
         "callPhoneNumber"     TEXT,
         "enhancedConversions" BOOLEAN NOT NULL DEFAULT true,
         "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"           TIMESTAMP(3) NOT NULL,
         CONSTRAINT "ClientAdsTracking_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "ClientAdsTracking_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id")
           ON DELETE CASCADE ON UPDATE CASCADE
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientAdsTracking_clientId_key" ON "ClientAdsTracking"("clientId")`,
    ],
  },
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
    for (const group of STATEMENTS) {
      for (const statement of group.sql) await ddl.$executeRawUnsafe(statement)
      applied.push(group.table)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('setup-db DDL failed:', message)
    return NextResponse.json({ ok: false, applied, error: message }, { status: 500 })
  } finally {
    await ddl.$disconnect().catch(() => {})
  }

  // Read each one back through the pooled client the app actually uses.
  const visible: Record<string, number | string> = {}
  try {
    visible.ClientLocation = await prisma.clientLocation.count()
    visible.ClientAdsTracking = await prisma.clientAdsTracking.count()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { ok: false, applied, error: `Created, but the app's pooled connection cannot read them: ${message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    applied,
    rows: visible,
    message: 'Database is up to date. The Shops card and Google Ads tracking will both save now.',
  })
}
