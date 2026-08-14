/**
 * Schema changes that must exist before the code that ships with them runs.
 *
 * Prisma selects every scalar it knows about. A column in the schema but not
 * in the database does not break the feature that added it — it breaks EVERY
 * query on that table. Adding four columns to Lead and deploying is therefore
 * an outage of lead capture, not a new feature, for however long it takes
 * somebody to remember to run the setup endpoint.
 *
 * So these statements run on server start, before the instance serves its
 * first request, and again from /api/admin/setup-db for anything already
 * running. All of them are IF NOT EXISTS, so running them on every cold start
 * costs a few milliseconds and running them twice costs nothing.
 *
 * This is the same idea as the Creatify block that was already in
 * instrumentation.ts, made reusable so the next one does not become a third
 * copy of the pattern.
 */

export const CALL_TRACKING_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "TrackingNumber" (
     "id"                TEXT NOT NULL,
     "clientId"          TEXT NOT NULL,
     "phoneNumber"       TEXT NOT NULL,
     "twilioSid"         TEXT,
     "label"             TEXT,
     "forwardTo"         TEXT NOT NULL,
     "recordCalls"       BOOLEAN NOT NULL DEFAULT true,
     "announceRecording" BOOLEAN NOT NULL DEFAULT true,
     "whisper"           TEXT,
     "active"            BOOLEAN NOT NULL DEFAULT true,
     "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "TrackingNumber_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "TrackingNumber_clientId_fkey"
       FOREIGN KEY ("clientId") REFERENCES "Client"("id")
       ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TrackingNumber_phoneNumber_key" ON "TrackingNumber"("phoneNumber")`,
  `CREATE INDEX IF NOT EXISTS "TrackingNumber_clientId_idx" ON "TrackingNumber"("clientId")`,
  // Columns on an existing table — the dangerous kind, and the reason this
  // module runs at startup rather than waiting to be asked.
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "twilioCallSid" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "callStatus" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "callDurationSecs" INTEGER`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Lead_twilioCallSid_key" ON "Lead"("twilioCallSid")`,
  `ALTER TABLE "TrackingNumber" ADD COLUMN IF NOT EXISTS "useOnSite" BOOLEAN NOT NULL DEFAULT false`,
]

/**
 * Offline conversion upload to Google Ads. Same rule as above: the Lead
 * columns are on an existing table, so they cannot wait for anyone to
 * remember to run an endpoint.
 */
export const OFFLINE_CONVERSION_SQL: string[] = [
  `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "offlineConversionActionId" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adsUploadedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adsUploadedValue" DOUBLE PRECISION`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adsUploadError" TEXT`,
]

/** Everything the running code assumes exists. */
export const BOOTSTRAP_SQL: string[] = [...CALL_TRACKING_SQL, ...OFFLINE_CONVERSION_SQL]

/**
 * Run them. Never throws: a database that is unreachable at boot must not
 * stop the server from starting, and the statements are retried on the next
 * cold start and by the setup endpoint.
 *
 * DDL goes through its OWN client on the DIRECT connection string, not the
 * shared pooled one. Production's pooled prisma+postgres:// role cannot
 * create tables — setup-db has known this all along and builds a direct
 * client for exactly this reason. The first version of this hook used the
 * shared client anyway, which meant it succeeded locally (direct connection)
 * and failed silently on every production cold start, leaving the tracking
 * numbers card telling the admin to go run the endpoint this hook exists to
 * make unnecessary.
 */
export async function ensureCallTrackingSchema(): Promise<{ ran: number; error?: string }> {
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!directUrl) return { ran: 0, error: 'No database URL configured' }
  if (directUrl.startsWith('prisma')) {
    return { ran: 0, error: 'Only a pooled prisma+postgres:// URL is available; DDL needs DIRECT_URL' }
  }

  const { PrismaClient } = await import('@prisma/client')
  const ddl = new PrismaClient({ datasourceUrl: directUrl })
  try {
    let ran = 0
    for (const sql of BOOTSTRAP_SQL) {
      await ddl.$executeRawUnsafe(sql)
      ran += 1
    }
    return { ran }
  } catch (error) {
    return { ran: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    await ddl.$disconnect().catch(() => {})
  }
}
