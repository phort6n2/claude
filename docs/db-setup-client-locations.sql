-- Multi-location clients (several shops, several Google Business Profiles).
--
-- Purely additive — one new table, no changes to existing tables — and every
-- read of it is wrapped in a catch, so ORDER DOES NOT MATTER. Run it before
-- or after deploying: until the table exists, getClientLocations() falls back
-- to the single Client address exactly as it does for a one-shop client.
--
-- Nothing is backfilled on purpose. A client with one shop should have ZERO
-- rows here; the moment a row exists, these rows become the site's addresses
-- and the Client scalar address stops being displayed. Half a list would mean
-- half a site.

BEGIN;

CREATE TABLE IF NOT EXISTS "ClientLocation" (
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
);

CREATE INDEX IF NOT EXISTS "ClientLocation_clientId_idx"
  ON "ClientLocation"("clientId");

COMMIT;
