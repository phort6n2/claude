-- Short site subdomains: database setup.
--
-- RUN THIS BEFORE deploying the subdomain-automation code. It adds a scalar
-- column to Client, which the deployed Prisma client will select on every
-- Client query — the column must exist before the code goes live (same rule
-- as the webhook-forwarding setup).
--
-- Purely additive; running it against the current production database
-- changes nothing about existing behavior.

BEGIN;

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "siteSubdomain" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_siteSubdomain_key"
  ON "Client"("siteSubdomain");

COMMIT;
