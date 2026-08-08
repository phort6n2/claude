-- Hosted site editorial content + photos: database setup.
--
-- Purely additive (two new tables + one enum, no changes to existing tables),
-- and all reads are defensive — ORDER DOES NOT MATTER relative to the deploy.
-- Site sections backed by this data simply stay hidden until content exists.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "SitePhotoPool" AS ENUM ('GALLERY', 'BODY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClientSiteContent" (
  "id"                 TEXT NOT NULL,
  "clientId"           TEXT NOT NULL,
  "warrantyTitle"      TEXT,
  "warrantyText"       TEXT,
  "faq"                JSONB,
  "heroBullets"        JSONB,
  "footerBlurb"        TEXT,
  "registrationName"   TEXT,
  "registrationNumber" TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientSiteContent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientSiteContent_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientSiteContent_clientId_key"
  ON "ClientSiteContent"("clientId");

CREATE TABLE IF NOT EXISTS "ClientSitePhoto" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "alt"       TEXT NOT NULL,
  "pool"      "SitePhotoPool" NOT NULL DEFAULT 'GALLERY',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientSitePhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientSitePhoto_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClientSitePhoto_clientId_pool_sortOrder_idx"
  ON "ClientSitePhoto"("clientId", "pool", "sortOrder");

COMMIT;
