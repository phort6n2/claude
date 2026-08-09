-- Google Ads conversion tracking for hosted landing pages.
--
-- Purely additive — one new table, no changes to existing tables — and the
-- read is wrapped in a catch, so ORDER DOES NOT MATTER. Until the table
-- exists, getAdsTracking() returns null and no tag is emitted, which is the
-- same as today.
--
-- Run it as the direct (prisma_migration) role — the pooled role the app runs
-- on cannot create tables; see "DDL needs the DIRECT url" in HANDOFF.md §8.

BEGIN;

CREATE TABLE IF NOT EXISTS "ClientAdsTracking" (
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
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientAdsTracking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientAdsTracking_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientAdsTracking_clientId_key"
  ON "ClientAdsTracking"("clientId");

COMMIT;
