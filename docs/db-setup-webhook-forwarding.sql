-- Webhook forwarding + per-client CORS origins: database setup.
--
-- RUN THIS BEFORE deploying the webhook-forwarding code (additions are
-- database-first: the deployed Prisma client will select Client."allowedOrigins"
-- on every Client query, so the column must exist before the code goes live).
--
-- Everything here is additive — running it against the current production
-- database changes nothing about existing behavior.

BEGIN;

-- Per-client browser origins allowed to POST to the lead webhook (CORS).
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Delivery status enum
DO $$ BEGIN
  CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Outbound webhook destinations (per client)
CREATE TABLE IF NOT EXISTS "WebhookDestination" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDestination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDestination_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WebhookDestination_clientId_idx"
  ON "WebhookDestination"("clientId");

-- Individual delivery attempts (one row per lead per destination)
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id"             TEXT NOT NULL,
  "destinationId"  TEXT NOT NULL,
  "leadId"         TEXT,
  "payload"        JSONB NOT NULL,
  "status"         "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt"  TIMESTAMP(3),
  "responseStatus" INTEGER,
  "lastError"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDelivery_destinationId_fkey"
    FOREIGN KEY ("destinationId") REFERENCES "WebhookDestination"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WebhookDelivery_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_updatedAt_idx"
  ON "WebhookDelivery"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_destinationId_createdAt_idx"
  ON "WebhookDelivery"("destinationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_leadId_idx"
  ON "WebhookDelivery"("leadId");

COMMIT;
