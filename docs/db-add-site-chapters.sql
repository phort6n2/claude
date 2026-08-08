-- Editorial chapters for hosted sites (ClientSiteContent.chapters).
-- Idempotent; safe to run at any time. The code reads this column in a
-- separate defensive query, so deploy order does not matter — chapters
-- simply stay hidden (and can't be saved) until this has run.
ALTER TABLE "ClientSiteContent" ADD COLUMN IF NOT EXISTS "chapters" JSONB;
