import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BOOTSTRAP_SQL } from '@/lib/schema-bootstrap'

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
    table: 'ClientDomain',
    sql: [
      `CREATE TABLE IF NOT EXISTS "ClientDomain" (
         "id"            TEXT NOT NULL,
         "clientId"      TEXT NOT NULL,
         "domain"        TEXT NOT NULL,
         "isPrimary"     BOOLEAN NOT NULL DEFAULT false,
         "verified"      BOOLEAN NOT NULL DEFAULT false,
         "misconfigured" BOOLEAN NOT NULL DEFAULT true,
         "lastCheckedAt" TIMESTAMP(3),
         "lastError"     TEXT,
         "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"     TIMESTAMP(3) NOT NULL,
         CONSTRAINT "ClientDomain_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "ClientDomain_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id")
           ON DELETE CASCADE ON UPDATE CASCADE
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientDomain_domain_key" ON "ClientDomain"("domain")`,
      `CREATE INDEX IF NOT EXISTS "ClientDomain_clientId_idx" ON "ClientDomain"("clientId")`,
    ],
  },
  {
    table: 'ClientCityContent',
    sql: [
      `CREATE TABLE IF NOT EXISTS "ClientCityContent" (
         "id"        TEXT NOT NULL,
         "clientId"  TEXT NOT NULL,
         "city"      TEXT NOT NULL,
         "heading"   TEXT,
         "body"      TEXT,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL,
         CONSTRAINT "ClientCityContent_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "ClientCityContent_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id")
           ON DELETE CASCADE ON UPDATE CASCADE
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientCityContent_clientId_city_key" ON "ClientCityContent"("clientId", "city")`,
      `CREATE INDEX IF NOT EXISTS "ClientCityContent_clientId_idx" ON "ClientCityContent"("clientId")`,
    ],
  },
  {
    table: 'ClientNotification',
    sql: [
      `CREATE TABLE IF NOT EXISTS "ClientNotification" (
         "id"           TEXT NOT NULL,
         "clientId"     TEXT NOT NULL,
         "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
         "emailTo"      TEXT[] DEFAULT ARRAY[]::TEXT[],
         "smsEnabled"   BOOLEAN NOT NULL DEFAULT false,
         "smsTo"        TEXT[] DEFAULT ARRAY[]::TEXT[],
         "smsActivatedAt" TIMESTAMP(3),
         "smsComplimentary" BOOLEAN NOT NULL DEFAULT false,
         "smsNote"      TEXT,
         "lastSentAt"   TIMESTAMP(3),
         "lastError"    TEXT,
         "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"    TIMESTAMP(3) NOT NULL,
         CONSTRAINT "ClientNotification_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "ClientNotification_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id")
           ON DELETE CASCADE ON UPDATE CASCADE
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientNotification_clientId_key" ON "ClientNotification"("clientId")`,
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
         "bingUetTagId"        TEXT,
         "bingLeadEventAction" TEXT,
         "googleAdsCustomerId" TEXT,
         "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"           TIMESTAMP(3) NOT NULL,
         CONSTRAINT "ClientAdsTracking_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "ClientAdsTracking_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id")
           ON DELETE CASCADE ON UPDATE CASCADE
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientAdsTracking_clientId_key" ON "ClientAdsTracking"("clientId")`,
      // Columns added after the table first shipped. ADD COLUMN IF NOT EXISTS
      // keeps this idempotent for databases that already ran the first version.
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "leadValue" DOUBLE PRECISION`,
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "leadCurrency" TEXT`,
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "callPhoneNumber" TEXT`,
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "bingUetTagId" TEXT`,
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "bingLeadEventAction" TEXT`,
      `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "googleAdsCustomerId" TEXT`,
    ],
  },
  {
    table: 'TrackingNumber, Lead call + ads-upload columns',
    // Shared with the startup hook so the two can never disagree about what
    // the schema needs — see lib/schema-bootstrap.ts.
    sql: BOOTSTRAP_SQL,
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
    visible.ClientDomain = await prisma.clientDomain.count()
    visible.ClientCityContent = await prisma.clientCityContent.count()
    visible.ClientNotification = await prisma.clientNotification.count()
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
