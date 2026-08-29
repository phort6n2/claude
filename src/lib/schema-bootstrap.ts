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
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT`,
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

/**
 * Per-shop claim flags. Prisma selects every scalar, so the column has to
 * exist before any client query runs — these ship with the boot hook rather
 * than a migration for the same reason as everything else here.
 */
export const CLAIM_FLAGS_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "filesInsuranceClaims" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "smsCapable" BOOLEAN NOT NULL DEFAULT false`,
]

/**
 * Local rank tracking (LocalDominator geogrid scans). Coordinates live on
 * Client because every scan needs a grid centre, and the scan table is
 * append-mostly — one row per keyword per run.
 */
export const LOCAL_RANK_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "seoClient" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "rankTrackingId" TEXT`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "rankKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
  `CREATE TABLE IF NOT EXISTS "LocalRankScan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "runUuid" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gridSize" INTEGER NOT NULL,
    "distance" INTEGER NOT NULL,
    "averageRank" DOUBLE PRECISION,
    "top3Percent" DOUBLE PRECISION,
    "top10Percent" DOUBLE PRECISION,
    "foundPercent" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocalRankScan_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LocalRankScan_runUuid_searchTerm_key" ON "LocalRankScan"("runUuid", "searchTerm")`,
  `CREATE INDEX IF NOT EXISTS "LocalRankScan_clientId_searchTerm_scannedAt_idx" ON "LocalRankScan"("clientId", "searchTerm", "scannedAt")`,
  `DO $$ BEGIN
    ALTER TABLE "LocalRankScan" ADD CONSTRAINT "LocalRankScan_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

export const RANK_MAP_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "rankMapUrl" TEXT`,
]

export const CONTENT_FEED_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contentFeedUrl" TEXT`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contentFeedCheckedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contentFeedError" TEXT`,
  `CREATE TABLE IF NOT EXISTS "SiteFeedItem" (
     "id"          TEXT NOT NULL,
     "clientId"    TEXT NOT NULL,
     "guid"        TEXT NOT NULL,
     "title"       TEXT NOT NULL,
     "url"         TEXT,
     "publishedAt" TIMESTAMP(3),
     "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "SiteFeedItem_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SiteFeedItem_clientId_guid_key" ON "SiteFeedItem"("clientId", "guid")`,
  `CREATE INDEX IF NOT EXISTS "SiteFeedItem_clientId_publishedAt_idx" ON "SiteFeedItem"("clientId", "publishedAt")`,
  `DO $$ BEGIN
    ALTER TABLE "SiteFeedItem" ADD CONSTRAINT "SiteFeedItem_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

export const CLARITY_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "clarityProjectId" TEXT`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "clarityApiToken" TEXT`,
]

export const RESPONSE_TIME_SQL: string[] = [
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "firstTouchedAt" TIMESTAMP(3)`,
]

export const CLARITY_HISTORY_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "ClarityDay" (
     "id"          TEXT NOT NULL,
     "clientId"    TEXT NOT NULL,
     "day"         TIMESTAMP(3) NOT NULL,
     "sessions"    INTEGER,
     "deadClicks"  INTEGER,
     "rageClicks"  INTEGER,
     "quickbacks"  INTEGER,
     "scrollDepth" DOUBLE PRECISION,
     "raw"         JSONB,
     "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ClarityDay_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClarityDay_clientId_day_key" ON "ClarityDay"("clientId", "day")`,
  `CREATE INDEX IF NOT EXISTS "ClarityDay_clientId_day_idx" ON "ClarityDay"("clientId", "day")`,
  `DO $$ BEGIN
    ALTER TABLE "ClarityDay" ADD CONSTRAINT "ClarityDay_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

export const CUTOVER_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "ClientRedirect" (
     "id"        TEXT NOT NULL,
     "clientId"  TEXT NOT NULL,
     "fromPath"  TEXT NOT NULL,
     "toPath"    TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ClientRedirect_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClientRedirect_clientId_fromPath_key" ON "ClientRedirect"("clientId", "fromPath")`,
  `CREATE INDEX IF NOT EXISTS "ClientRedirect_clientId_idx" ON "ClientRedirect"("clientId")`,
  `DO $$ BEGIN
    ALTER TABLE "ClientRedirect" ADD CONSTRAINT "ClientRedirect_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "ClientPage" (
     "id"              TEXT NOT NULL,
     "clientId"        TEXT NOT NULL,
     "path"            TEXT NOT NULL,
     "title"           TEXT NOT NULL,
     "metaDescription" TEXT,
     "bodyHtml"        TEXT,
     "sourceUrl"       TEXT,
     "publishedAt"     TIMESTAMP(3),
     "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ClientPage_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClientPage_clientId_path_key" ON "ClientPage"("clientId", "path")`,
  `CREATE INDEX IF NOT EXISTS "ClientPage_clientId_publishedAt_idx" ON "ClientPage"("clientId", "publishedAt")`,
  `DO $$ BEGIN
    ALTER TABLE "ClientPage" ADD CONSTRAINT "ClientPage_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Added after ClientPage shipped, so it is an ALTER rather than part of the
  // CREATE above — the CREATE is a no-op on every database that already has
  // the table. Prisma selects every scalar on a model, so this statement and
  // the schema field have to travel in the same commit or every query against
  // ClientPage fails until it runs.
  `ALTER TABLE "ClientPage" ADD COLUMN IF NOT EXISTS "navLabel" TEXT`,
  // A tracking number this app does not own. Same rule as every other column
  // added after the fact: the schema field and this statement ship together,
  // because Prisma selects every scalar and would otherwise fail every query
  // against Client until it runs.
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "siteDisplayPhone" TEXT`,
]

/**
 * A second logo, for the dark footer band. Same rule as every column above:
 * Prisma selects every scalar on Client, so this statement and the schema
 * field ship in the same commit or every query against Client fails until it
 * has run.
 */
export const SITE_BRANDING_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "footerLogoUrl" TEXT`,
]

/**
 * Per-client notification preferences added after ClientNotification shipped.
 * Same rule as every column above: Prisma selects every scalar on the model,
 * so this statement and the schema field travel in the same commit or every
 * query against ClientNotification fails until it has run.
 */
export const NOTIFICATION_PREFS_SQL: string[] = [
  `ALTER TABLE "ClientNotification" ADD COLUMN IF NOT EXISTS "emailCallLeads" BOOLEAN NOT NULL DEFAULT true`,
]

/**
 * Client intake drafts. A new table, so this is a CREATE rather than the
 * usual ALTER — but it ships the same way, because the route that reads it
 * fails until it exists.
 */
export const CLIENT_INTAKE_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "ClientIntake" (
     "id"           TEXT NOT NULL,
     "businessName" TEXT NOT NULL,
     "email"        TEXT NOT NULL,
     "seo"          BOOLEAN NOT NULL DEFAULT false,
     "kind"         TEXT NOT NULL DEFAULT 'NEW',
     "status"       TEXT NOT NULL DEFAULT 'SENT',
     "answers"      JSONB,
     "sentAt"       TIMESTAMP(3),
     "startedAt"    TIMESTAMP(3),
     "submittedAt"  TIMESTAMP(3),
     "approvedAt"   TIMESTAMP(3),
     "clientId"     TEXT,
     "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ClientIntake_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "ClientIntake_status_idx" ON "ClientIntake"("status")`,
]

/**
 * Owner-pasted site scripts and the GA4 measurement id. Columns on existing
 * tables, so the same rule as everything above: they ship with the code that
 * selects them.
 */
export const SITE_SCRIPTS_SQL: string[] = [
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "headScripts" TEXT`,
  `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "bodyEndScripts" TEXT`,
  `ALTER TABLE "ClientAdsTracking" ADD COLUMN IF NOT EXISTS "ga4MeasurementId" TEXT`,
]

/** Everything the running code assumes exists. */
export const BOOTSTRAP_SQL: string[] = [
  ...CALL_TRACKING_SQL,
  ...OFFLINE_CONVERSION_SQL,
  ...CLAIM_FLAGS_SQL,
  ...LOCAL_RANK_SQL,
  ...RANK_MAP_SQL,
  ...CONTENT_FEED_SQL,
  ...CLARITY_SQL,
  ...CLARITY_HISTORY_SQL,
  ...RESPONSE_TIME_SQL,
  ...CUTOVER_SQL,
  ...SITE_BRANDING_SQL,
  ...NOTIFICATION_PREFS_SQL,
  ...CLIENT_INTAKE_SQL,
  ...SITE_SCRIPTS_SQL,
]

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
