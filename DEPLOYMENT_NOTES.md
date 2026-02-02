# Deployment Notes - Auto Glass Content Automation Platform

This document tracks the development history, major features, bug fixes, and lessons learned while building this platform.

---

## Table of Contents
1. [Platform Overview](#platform-overview)
2. [Major Development Phases](#major-development-phases)
3. [Content Creation System](#content-creation-system)
4. [Critical Bug Fixes](#critical-bug-fixes)
5. [Integration Notes](#integration-notes)
6. [Cron Jobs & Automation](#cron-jobs--automation)
7. [Lessons Learned](#lessons-learned)

---

## Platform Overview

**Purpose:** Automated content marketing platform for auto glass shops that transforms PAA (People Also Ask) questions into multi-channel content.

**Tech Stack:**
- Next.js 14+ (App Router)
- Vercel Postgres with Prisma ORM
- NextAuth.js authentication
- Tailwind CSS
- Google Cloud Storage for media

**External Integrations:**
| Service | Purpose |
|---------|---------|
| Claude (Anthropic) | Blog posts, social captions, scripts |
| Creatify | Short video generation (15-60 seconds) |
| AutoContent | Podcast audio generation |
| Nano Banana | AI image generation |
| Late.dev | Social media scheduling |
| WordPress | Blog publishing |
| Podbean | Podcast publishing |
| Google Ads API | Lead conversion tracking |

---

## Major Development Phases

### Phase 1: Initial Platform Build
**Commit:** `fb9f401` - Build Auto Glass Content Automation Platform

Initial feature set included:
- Client management with WordPress integration
- Basic content pipeline (PAA → Blog → Images → Social)
- Admin dashboard and client portal
- Prisma schema for all content types

**Early Fixes:**
- Prisma 7 configuration issues
- TypeScript implicit any errors
- GCS credential handling improvements

---

### Phase 2: Image Pipeline Stabilization

**Problem:** Images were being stored as base64 in database, causing performance issues.

**Fixes:**
- `234b745` - Upload images to GCS in generate route instead of storing base64
- `f806493` - Add image compression for blog featured images
- `c53832b` - Add image compression and PROCESSING status for social posts

**Image Format Journey:**
1. Started with original URLs → caused format inconsistencies
2. Switched to PNG for all → `5c02de4`
3. Then switched to JPG for smaller files → `6b1ca47`
4. Finally settled on: convert all to PNG at upload → `3bb0780`

---

### Phase 3: Late.dev Social Integration

**Key Commits:**
- `f3d43e5` - Fix Late API request format to match documentation
- `bf15667` - Map platform names to Late API identifiers
- `88f419d` - Fix Late API structure - platformSpecificData goes inside platform object
- `1c61e91` - Add Late webhook endpoint for real-time post status updates
- `420491d` - Fix Late webhook handler to match actual payload format

**Lesson Learned:** Late.dev API documentation didn't always match actual behavior. Had to add extensive logging and iterate on the payload structure.

---

### Phase 4: Video Generation (Creatify)

**Initial Implementation:**
- Custom template approach with variable substitution
- Aurora model (high quality, expensive)

**Evolution:**
- `cd0d60a` - Switch to URL-to-Video API for reliable 30-second videos
- `a03ad3a` - Use 'standard' model (cheapest option)
- `46337d5` - Default to AvatarBubbleTemplate visual style
- `91e3265` - Add random avatar selection when none specified
- `17dbfeb` - Change default video length from 30 to 15 seconds
- `fa07d28` - Add separate 'Random' avatar option in UI

**Creatify Settings Per Client:**
- `creatifyTemplateId` - Custom template UUID
- `creatifyAvatarId` - Override avatar
- `creatifyVoiceId` - Override voice
- `creatifyVisualStyle` - Visual template style
- `creatifyScriptStyle` - Script generation style
- `creatifyModelVersion` - standard | aurora_v1 | aurora_v1_fast
- `creatifyVideoLength` - 15, 30, 45, or 60 seconds
- `creatifyNoCta` - Disable default CTA

---

### Phase 5: Automated Scheduling System

**Planning Document:** `AUTOMATION_PLAN.md`

**Requirements Implemented:**
1. PAA uniqueness - each PAA used only once per client (then recycled)
2. Location rotation - cycle through service areas equally
3. Client opt-in toggle for automation
4. Skip long video from automation (no reliable API)

**Key Files Created:**
- `src/lib/automation/paa-selector.ts` - PAA selection with recycle logic
- `src/lib/automation/location-rotator.ts` - Least-recently-used location picking
- `src/lib/automation/auto-scheduler.ts` - Smart slot assignment
- `src/app/api/cron/hourly-publish/route.ts` - Main automation cron

**Scheduling Evolution:**
1. Started with weekly cron (Sunday for Tue/Thu) → `caaca25`
2. Simplified to hourly cron checking slots → `27e2e9a`
3. Moved to Mountain Time only → `b9130c6`
4. Added slot conflict prevention → `c23e93b`

**Time Slot System:**
- Morning slots: 0-4 (7 AM - 11 AM MT)
- Afternoon slots: 5-9 (1 PM - 5 PM MT)
- Staggered 12 hours apart to avoid Late.dev 24-hour conflicts
- Maximum 10 clients per day

---

### Phase 6: UI/UX Redesign

**Modern Theme Applied Across All Pages:**
- `a79f647` - Add shared theme components
- `bfade69` - Redesign clients page with modern UI/UX
- `f6377c5` - Redesign monitoring dashboard
- `204aa09` - Apply theme to leads, settings, and PAA library pages
- `e8449da` - Add table view for clients page with search and sorting

---

### Phase 7: GBP (Google Business Profile) Posting

**Planning Document:** `PLAN-gbp-posting-service.md`

**Features Implemented:**
- AI-generated posts using Claude
- Photo rotation (GBP profile photos, AI-generated, or uploaded)
- Link rotation through service pages, blog, WRHQ, Google Maps
- CTA button support (LEARN_MORE, BOOK, CALL, etc.)
- Daily automated posting via cron

**Key Files:**
- `src/lib/gbp/post-generator.ts` - AI post generation
- `src/app/api/cron/gbp-posts/route.ts` - Daily cron (2 PM UTC)

---

### Phase 8: Google Ads Integration

**Design Document:** `docs/google-ads-api-design-doc.md`

**Features:**
1. Enhanced Conversions for Leads - send hashed user data on form submit
2. Offline Conversion Import - report sales back to Google Ads
3. MCC (Manager Account) support for agency model

**Key Commits:**
- `1c2348a` - Update Google Ads API from v18 to v19
- `086a051` - Fix Enhanced Conversions to use uploadClickConversions endpoint
- `17a1bd7` - Send Enhanced Conversions for all leads with user data
- `8ec72ec` - Add bulk sync endpoint for all leads to Google Ads

**Debugging Journey:**
- `28c9fcb` - Add better error logging for Google Ads API 404 errors
- `9b0b994` - Add Google Ads debug endpoint for connection troubleshooting
- `d170a73` - Add debug endpoint for enhanced conversion status
- `338865c` - Add detailed error logging for enhanced conversions

---

### Phase 9: Lead Management & Call Recording

**Commits:**
- `fc6e21d` - Add call recording support with audio player
- `e9edb25` - Redesign master leads page with accordion-style layout
- `e375bf0` - Redesign portal leads page with accordion-style layout
- `befa4df` - Prevent horizontal scrolling on leads pages for mobile

**Call Recording Saga:**
1. Added feature → `fc6e21d`
2. Reverted - database not migrated → `422e338`
3. Added migration endpoint → `bb6ed99`
4. Fixed to check customData for recording URL → `3c4d781`

---

## Content Creation System

### Manual Content Creation

**UI Components:**
- `ContentForm.tsx` - Full form with client/PAA/location selection
- `CreateContentModal.tsx` - Quick modal for draft creation

**Workflow:**
1. Admin selects client, PAA question, location
2. Creates ContentItem via `POST /api/content`
3. Triggers generation via `/api/content/[id]/generate`
4. Reviews each piece at `/admin/content/[id]/review`
5. Approves and publishes via `/api/content/[id]/publish`

### Automated Content Creation

**Configuration Per Client:**
```
autoScheduleEnabled: true/false
autoScheduleFrequency: 1 or 2 posts/week
scheduleDayPair: MON_WED, TUE_THU, WED_FRI, etc.
scheduleTimeSlot: 0-9
preferredPublishTime: HH:MM
timezone: America/Denver (default)
```

**How It Works:**
1. Hourly cron checks if any client's slot matches current MT hour
2. PAA selector picks least-used question (or recycles oldest)
3. Location rotator picks least-recently-used service area
4. Content pipeline runs: blog → images → social → podcast → short video
5. Content lands in REVIEW status

---

## Critical Bug Fixes

### Scheduling Bugs

**Critical - Race Condition:**
- `01b6091` - Fix critical scheduling bugs: race condition, missing time, podcast failures
- Issue: Multiple content items created for same slot due to async race

**Medium - Timezone Issues:**
- `836ccd7` - Fix medium-severity scheduling bugs: timezone, recovery, orphaned content
- `54b346d` - Fix timezone handling and improve recovery cron robustness
- `03e4bec` - Change default timezone from Pacific to Mountain Time

**Slot Conflicts:**
- `c23e93b` - Fix slot assignment to prevent same-day conflicts
- Issue: Different day pairs (MON_WED vs TUE_THU) could conflict on same day

### Status Workflow Issues

- `36b9309` - Fix status workflow consistency - manual publish now sets PUBLISHED
- `ba97864` - Fix autopost scheduling not initiating due to stuck GENERATING content
- `bccfbb0` - Fix hourly-publish duplicate check to ignore FAILED content

### Pipeline Failures

- `f4c0d43` - Add pipeline reliability improvements and rate limiting
- `008f0b6` - Fix multiple critical bugs and security issues
- `f3047dc` - Never skip content generation - use next available PAA instead

---

## Integration Notes

### Late.dev (Social Scheduling)

**Rate Limits:**
- 5 posts per account in rolling 24-hour window
- Implemented exponential backoff for failures

**Quirks:**
- Platform-specific data structure varies by platform
- Hashtag formatting differs (some platforms don't support)
- First comment support only on Facebook/Instagram

### Creatify (Video Generation)

**API Versions:**
- Custom Template - variable substitution
- Link to Videos (URL-to-Video) - most reliable for short videos
- Lipsync - script-based generation

**Model Tiers:**
- `standard` - cheapest, good quality
- `aurora_v1` - highest quality, expensive
- `aurora_v1_fast` - balanced

### AutoContent (Podcasts)

**Timeouts:**
- Podcast generation can take up to 30 minutes
- Must poll status endpoint repeatedly
- Implemented webhook fallback

### WordPress

**Requirements:**
- Application password (not regular password)
- REST API enabled
- Featured image upload before post creation

---

## Cron Jobs & Automation

### Current Production Crons (vercel.json)

| Cron | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/hourly-publish` | `0 * * * 1-5` | Main content automation (Mon-Fri, every hour) |
| `/api/cron/generate-press-releases` | `0 2 1 * *` | Monthly press releases (1st of month, 2 AM) |
| `/api/cron/check-social-published` | `0 */6 * * *` | Poll Late.dev for publication status |
| `/api/cron/gbp-posts` | `0 14 * * *` | Daily GBP posts (2 PM UTC = 6 AM PT) |
| `/api/cron/recover-stuck-content` | `0 */3 * * *` | Retry failed content generation |

### Deprecated Crons

- `/api/cron/auto-schedule-weekly` - Replaced by hourly-publish
- `/api/cron/daily-publish` - Replaced by hourly-publish
- `/api/cron/generate-content` - Merged into hourly-publish

---

## Lessons Learned

### 1. Timezone Handling
- Always store and compute in one consistent timezone (Mountain Time)
- Client display can convert, but backend should be consistent
- JavaScript Date timezone bugs are subtle and dangerous

### 2. External API Integration
- Always add extensive logging for debugging
- API documentation often doesn't match reality
- Implement exponential backoff from day one
- Store raw responses for debugging failed requests

### 3. Status Workflows
- Clearly define all status transitions
- Handle FAILED status explicitly (don't let it block future content)
- Add recovery mechanisms for stuck states

### 4. Database Migrations
- Test migrations on production-like data before deploying
- Have rollback plan for schema changes
- Add migration endpoints for optional column additions

### 5. Content Pipeline
- Make each step idempotent (safe to retry)
- Track pipeline step for debugging
- Implement timeouts appropriate to each external API
- Never block one client's failure from affecting others

### 6. User Experience
- Mobile responsive is critical (leads are often viewed on phone)
- Accordion layouts work well for dense data
- Provide debug endpoints for troubleshooting

---

## Git Statistics

- **Total Commits:** 380
- **First Commit:** `2079ea3` - Initial commit
- **Platform Build:** `fb9f401` - Build Auto Glass Content Automation Platform
- **Latest Features:** Google Ads integration, call recording, mobile UX improvements

---

*Last Updated: February 2026*
*Document Version: 1.0*
