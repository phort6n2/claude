-- Database cleanup after the content-system / Google Ads removal (August 2026).
--
-- RUN THIS ONLY AFTER the code removal has deployed to production.
-- Removals are safe code-first: once the deployed Prisma client no longer
-- declares these tables/columns, nothing selects them, and dropping them
-- cannot break a query. Running this BEFORE the deploy would take down every
-- query touching Client and Lead.
--
-- Everything here is destructive and non-reversible. Take a database backup
-- (or use your provider's restore point) before running.

BEGIN;

-- ============================================================
-- 1. Content-system tables (drop children before parents;
--    CASCADE handles the remaining FK edges between them)
-- ============================================================
DROP TABLE IF EXISTS "PublishingLog" CASCADE;
DROP TABLE IF EXISTS "SocialPost" CASCADE;
DROP TABLE IF EXISTS "WRHQSocialPost" CASCADE;
DROP TABLE IF EXISTS "ShortFormVideo" CASCADE;
DROP TABLE IF EXISTS "Video" CASCADE;
DROP TABLE IF EXISTS "Podcast" CASCADE;
DROP TABLE IF EXISTS "Image" CASCADE;
DROP TABLE IF EXISTS "BlogPost" CASCADE;
DROP TABLE IF EXISTS "WRHQBlogPost" CASCADE;
DROP TABLE IF EXISTS "PressRelease" CASCADE;
DROP TABLE IF EXISTS "ServicePage" CASCADE;
DROP TABLE IF EXISTS "LocationPage" CASCADE;
DROP TABLE IF EXISTS "ContentItem" CASCADE;
DROP TABLE IF EXISTS "ClientPAA" CASCADE;
DROP TABLE IF EXISTS "StandardPAA" CASCADE;
DROP TABLE IF EXISTS "ServiceLocation" CASCADE;
DROP TABLE IF EXISTS "GBPPost" CASCADE;
DROP TABLE IF EXISTS "GBPPostConfig" CASCADE;

-- ============================================================
-- 2. Google Ads tables
-- ============================================================
DROP TABLE IF EXISTS "ClientGoogleAds" CASCADE;
DROP TABLE IF EXISTS "GoogleAdsConfig" CASCADE;

-- ============================================================
-- 3. Content-system enum types
-- ============================================================
DROP TYPE IF EXISTS "ContentStatus";
DROP TYPE IF EXISTS "ApprovalStatus";
DROP TYPE IF EXISTS "ImageType";
DROP TYPE IF EXISTS "MediaStatus";
DROP TYPE IF EXISTS "VideoType";
DROP TYPE IF EXISTS "VideoProvider";
DROP TYPE IF EXISTS "SocialPlatform";
DROP TYPE IF EXISTS "SocialPostStatus";
DROP TYPE IF EXISTS "PressReleaseStatus";
DROP TYPE IF EXISTS "LogStatus";
DROP TYPE IF EXISTS "GBPPostFrequency";
DROP TYPE IF EXISTS "GBPPhotoSource";
DROP TYPE IF EXISTS "GBPCtaType";
DROP TYPE IF EXISTS "GBPPostStatus";

-- ============================================================
-- 4. Content-machinery columns on Client
-- ============================================================
ALTER TABLE "Client"
  DROP COLUMN IF EXISTS "brandVoice",
  DROP COLUMN IF EXISTS "wordpressUrl",
  DROP COLUMN IF EXISTS "wordpressUsername",
  DROP COLUMN IF EXISTS "wordpressAppPassword",
  DROP COLUMN IF EXISTS "wordpressConnected",
  DROP COLUMN IF EXISTS "ctaText",
  DROP COLUMN IF EXISTS "ctaUrl",
  DROP COLUMN IF EXISTS "creatifyTemplateId",
  DROP COLUMN IF EXISTS "creatifyAvatarId",
  DROP COLUMN IF EXISTS "creatifyVoiceId",
  DROP COLUMN IF EXISTS "creatifyVisualStyle",
  DROP COLUMN IF EXISTS "creatifyScriptStyle",
  DROP COLUMN IF EXISTS "creatifyModelVersion",
  DROP COLUMN IF EXISTS "creatifyVideoLength",
  DROP COLUMN IF EXISTS "creatifyNoCta",
  DROP COLUMN IF EXISTS "preferredPublishTime",
  DROP COLUMN IF EXISTS "socialPlatforms",
  DROP COLUMN IF EXISTS "socialAccountIds",
  DROP COLUMN IF EXISTS "disconnectedAccounts",
  DROP COLUMN IF EXISTS "wrhqDirectoryUrl",
  DROP COLUMN IF EXISTS "gbpPlaceId",
  DROP COLUMN IF EXISTS "gbpRating",
  DROP COLUMN IF EXISTS "gbpReviewCount",
  DROP COLUMN IF EXISTS "podbeanPodcastId",
  DROP COLUMN IF EXISTS "podbeanPodcastTitle",
  DROP COLUMN IF EXISTS "podbeanPodcastUrl",
  DROP COLUMN IF EXISTS "wrhqYoutubePlaylistId",
  DROP COLUMN IF EXISTS "wrhqYoutubePlaylistTitle",
  DROP COLUMN IF EXISTS "calendarGenerated",
  DROP COLUMN IF EXISTS "calendarGeneratedAt",
  DROP COLUMN IF EXISTS "calendarEndDate",
  DROP COLUMN IF EXISTS "autoScheduleEnabled",
  DROP COLUMN IF EXISTS "autoScheduleFrequency",
  DROP COLUMN IF EXISTS "lastAutoScheduledAt",
  DROP COLUMN IF EXISTS "scheduleDayPair",
  DROP COLUMN IF EXISTS "scheduleTimeSlot";

-- ============================================================
-- 5. Google Ads sync columns on Lead
--    (dropping offlineConversionSent also drops its index)
-- ============================================================
ALTER TABLE "Lead"
  DROP COLUMN IF EXISTS "enhancedConversionSent",
  DROP COLUMN IF EXISTS "enhancedConversionSentAt",
  DROP COLUMN IF EXISTS "offlineConversionSent",
  DROP COLUMN IF EXISTS "offlineConversionSentAt",
  DROP COLUMN IF EXISTS "googleSyncError";

-- ============================================================
-- 6. Stale content-integration keys in Setting (optional but
--    recommended: some are stored encrypted credentials)
-- ============================================================
DELETE FROM "Setting" WHERE "key" IN (
  'NANO_BANANA_API_KEY',
  'AUTOCONTENT_API_KEY',
  'CREATIFY_API_KEY',
  'GETLATE_API_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_CLOUD_STORAGE_BUCKET',
  'GOOGLE_CLOUD_CREDENTIALS',
  'PODBEAN_CLIENT_ID',
  'PODBEAN_CLIENT_SECRET',
  'DATAFORSEO_LOGIN',
  'DATAFORSEO_PASSWORD',
  'GBP_CLIENT_ID',
  'GBP_CLIENT_SECRET',
  'GCS_CREDENTIALS_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON'
);

-- WRHQ dual-publishing keys (WordPress creds, Late account ids, YouTube OAuth
-- tokens) stored by the deleted /admin/settings/wrhq page.
DELETE FROM "Setting" WHERE "key" LIKE 'WRHQ\_%' ESCAPE '\';

COMMIT;
