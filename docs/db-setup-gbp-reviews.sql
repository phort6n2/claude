-- GBP reviews cache for hosted landing pages: database setup.
--
-- Purely additive (one new table, no changes to existing tables), and the
-- code that reads it is defensive — so unlike the webhook-forwarding setup,
-- ORDER DOES NOT MATTER here. Run it before or after deploying; the reviews
-- band simply stays hidden until both the table and cached data exist.

BEGIN;

CREATE TABLE IF NOT EXISTS "ClientGbpReviews" (
  "id"          TEXT NOT NULL,
  "clientId"    TEXT NOT NULL,
  "placeName"   TEXT NOT NULL,
  "rating"      DOUBLE PRECISION NOT NULL,
  "reviewCount" INTEGER NOT NULL,
  "reviews"     JSONB NOT NULL,
  "fetchedAt"   TIMESTAMP(3) NOT NULL,
  "lastError"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientGbpReviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientGbpReviews_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientGbpReviews_clientId_key"
  ON "ClientGbpReviews"("clientId");

COMMIT;
