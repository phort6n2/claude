# GBP Posting Service - Implementation Plan

## Overview
Create a standalone Google Business Profile posting service that can operate independently of the main content flow. This enables a "light" version of the service for clients who only want GBP management.

## Features
1. **AI-Generated Posts** - Create engaging GBP posts using Claude
2. **Photo Integration** - Pull photos from GBP profile or use existing images
3. **Scheduled Automation** - Run on configurable schedules
4. **Link Rotation** - Rotate through multiple destination URLs
5. **CTA Button Support** - "Learn More" buttons to service pages, citations, etc.

---

## Architecture

### Option A: Direct Google API Integration (Recommended for Photos)
**Pros**: Can fetch actual photos from GBP profile
**Cons**: Requires OAuth setup, more complex

### Option B: Use Existing Late Integration + System Photos
**Pros**: Already integrated for posting, simpler
**Cons**: Can't pull photos from GBP directly

### Recommended: Hybrid Approach
- Use **Google Business Profile API** for fetching photos
- Use **Late** for posting (already working)
- Store fetched photos in GCS for reuse

---

## Database Changes

### New Model: GBPPostConfig
```prisma
model GBPPostConfig {
  id              String    @id @default(cuid())
  clientId        String    @unique
  client          Client    @relation(fields: [clientId], references: [id])

  // Schedule
  enabled         Boolean   @default(false)
  frequency       String    @default("weekly") // daily, weekly, biweekly, monthly
  preferredDays   Int[]     // 0=Sunday, 1=Monday, etc.
  preferredTime   String    @default("10:00")

  // Link Rotation
  rotationLinks   Json      // Array of { url, label, type }
  currentLinkIndex Int      @default(0)

  // Content Settings
  postTopics      String[]  // Optional topic suggestions
  includePromo    Boolean   @default(true)
  includePhone    Boolean   @default(true)

  // Google API (for photo fetching)
  googleAccessToken   String?   // Encrypted
  googleRefreshToken  String?   // Encrypted
  googleTokenExpiry   DateTime?

  // Cached Photos from GBP
  cachedPhotos    Json?     // Array of { url, thumbnailUrl, category }
  photosLastFetched DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model GBPPost {
  id              String    @id @default(cuid())
  clientId        String
  client          Client    @relation(fields: [clientId], references: [id])

  // Content
  content         String
  photoUrl        String?
  ctaUrl          String?
  ctaType         String?   // LEARN_MORE, BOOK, CALL, etc.

  // Status
  status          String    @default("draft") // draft, scheduled, published, failed
  scheduledFor    DateTime?
  publishedAt     DateTime?

  // Late Integration
  latePostId      String?
  platformPostUrl String?   // URL to view on GBP

  // Error tracking
  errorMessage    String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### Client Model Updates
```prisma
// Add to Client model
gbpPostConfig     GBPPostConfig?
gbpPosts          GBPPost[]
gbpServiceLinks   Json?     // Array of { url, label } for link rotation
```

---

## Link Rotation Structure

```typescript
interface RotationLink {
  url: string
  label: string
  type: 'service_page' | 'blog' | 'wrhq' | 'google_maps' | 'citation' | 'custom'
  weight?: number  // Optional: higher weight = more frequent
}

// Example configuration
const rotationLinks: RotationLink[] = [
  { url: 'https://example.com/windshield-repair', label: 'Windshield Repair', type: 'service_page' },
  { url: 'https://example.com/windshield-replacement', label: 'Windshield Replacement', type: 'service_page' },
  { url: 'https://wrhq.com/client', label: 'WRHQ Listing', type: 'wrhq' },
  { url: 'https://maps.google.com/?cid=...', label: 'Google Maps', type: 'google_maps' },
  { url: 'https://yelp.com/biz/...', label: 'Yelp', type: 'citation' },
]
```

---

## API Routes

### GBP Configuration
- `GET /api/clients/[id]/gbp-config` - Get GBP posting configuration
- `PUT /api/clients/[id]/gbp-config` - Update configuration
- `POST /api/clients/[id]/gbp-config/connect-google` - Start OAuth flow
- `GET /api/clients/[id]/gbp-config/oauth-callback` - Handle OAuth callback

### GBP Photos
- `GET /api/clients/[id]/gbp-photos` - List photos from GBP profile
- `POST /api/clients/[id]/gbp-photos/refresh` - Re-fetch photos from Google

### GBP Posts
- `GET /api/clients/[id]/gbp-posts` - List all GBP posts
- `POST /api/clients/[id]/gbp-posts` - Create new post (manual or AI)
- `POST /api/clients/[id]/gbp-posts/generate` - Generate AI post content
- `POST /api/clients/[id]/gbp-posts/[postId]/publish` - Publish post via Late
- `DELETE /api/clients/[id]/gbp-posts/[postId]` - Delete draft post

### Cron
- `GET /api/cron/gbp-posts` - Scheduled cron to generate and publish posts

---

## Admin UI Pages

### 1. GBP Dashboard (`/admin/gbp`)
- Overview of all clients with GBP enabled
- Quick stats: posts this week, scheduled posts, failed posts
- Client list with status indicators

### 2. Client GBP Settings (`/admin/clients/[id]/gbp`)
- Enable/disable GBP posting
- Schedule configuration (frequency, days, time)
- Link rotation management (add/remove/reorder links)
- Google account connection status
- Photo gallery from GBP

### 3. GBP Post Editor (`/admin/clients/[id]/gbp/posts`)
- List of all posts (draft, scheduled, published)
- Create new post:
  - AI generate or manual entry
  - Photo selection (from GBP or upload)
  - Link/CTA selection
  - Schedule or publish immediately
- Edit/delete drafts

---

## AI Post Generation

### Prompt Strategy
```typescript
const generateGBPPost = async (client: Client, options: {
  topic?: string
  includePromo: boolean
  includePhone: boolean
  ctaUrl: string
  ctaLabel: string
}) => {
  const prompt = `Generate a Google Business Profile post for ${client.businessName},
an auto glass repair company in ${client.city}, ${client.state}.

Requirements:
- Keep it under 1500 characters (GBP limit)
- Be engaging and local-focused
- ${options.includePromo ? 'Include a promotional offer or value proposition' : ''}
- ${options.includePhone ? `Include phone number: ${client.phone}` : ''}
- End with a call to action for: ${options.ctaLabel}
${options.topic ? `- Focus on topic: ${options.topic}` : ''}

Services offered: ${getClientServices(client).join(', ')}
Service areas: ${client.serviceAreas.join(', ')}
`
  // Call Claude API...
}
```

### Post Topics Rotation
- Windshield repair tips
- ADAS calibration importance
- Mobile service convenience
- Seasonal topics (winter driving, summer road trips)
- Customer testimonial themes
- New service announcements
- Local community mentions

---

## Cron Job Logic

```typescript
// /api/cron/gbp-posts
export async function GET(request: NextRequest) {
  // 1. Get all clients with GBP enabled and due for posting
  const dueClients = await prisma.client.findMany({
    where: {
      gbpPostConfig: {
        enabled: true,
        // Check if due based on frequency and last post
      }
    },
    include: { gbpPostConfig: true }
  })

  for (const client of dueClients) {
    // 2. Get next link in rotation
    const nextLink = getNextRotationLink(client.gbpPostConfig)

    // 3. Generate AI post
    const postContent = await generateGBPPost(client, {
      ctaUrl: nextLink.url,
      ctaLabel: nextLink.label,
      ...client.gbpPostConfig
    })

    // 4. Select photo (random from cached GBP photos or fallback)
    const photo = selectPhoto(client)

    // 5. Publish via Late
    const result = await schedulePost({
      accountId: client.socialAccountIds.gbp,
      platform: 'gbp',
      caption: postContent,
      mediaUrls: photo ? [photo] : undefined,
      mediaType: 'image',
      scheduledTime: new Date(),
      ctaUrl: nextLink.url
    })

    // 6. Save post record and increment link rotation
    await prisma.gBPPost.create({ ... })
    await incrementLinkRotation(client.gbpPostConfig)
  }
}
```

---

## Google OAuth Setup

### Required Scopes
- `https://www.googleapis.com/auth/business.manage` - Full access to business profile

### OAuth Flow
1. User clicks "Connect Google Account" in admin
2. Redirect to Google OAuth consent screen
3. User grants permission
4. Callback saves access/refresh tokens (encrypted)
5. Use tokens to fetch photos from GBP

### Token Refresh
- Check token expiry before API calls
- Auto-refresh using refresh token
- Handle refresh failures gracefully

---

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)
1. Database migrations (GBPPostConfig, GBPPost models)
2. Basic API routes for config and posts
3. AI post generation using Claude
4. Integration with existing Late posting
5. Simple admin UI for managing posts

### Phase 2: Photo Integration
1. Google OAuth flow implementation
2. Photo fetching from GBP API
3. Photo caching in database
4. Photo selection UI in post editor

### Phase 3: Automation
1. Cron job for scheduled posting
2. Link rotation logic
3. Scheduling UI with calendar view
4. Notification on post success/failure

### Phase 4: Polish
1. Analytics dashboard (post performance)
2. Post templates/presets
3. Bulk scheduling
4. A/B testing different post styles

---

## Files to Create/Modify

### New Files
- `prisma/migrations/xxx_add_gbp_posting.sql`
- `src/lib/integrations/google-business.ts` - Google API client
- `src/lib/gbp/post-generator.ts` - AI post generation
- `src/lib/gbp/link-rotator.ts` - Link rotation logic
- `src/app/api/clients/[id]/gbp-config/route.ts`
- `src/app/api/clients/[id]/gbp-posts/route.ts`
- `src/app/api/clients/[id]/gbp-photos/route.ts`
- `src/app/api/cron/gbp-posts/route.ts`
- `src/app/admin/gbp/page.tsx` - GBP dashboard
- `src/app/admin/clients/[id]/gbp/page.tsx` - Client GBP settings

### Modified Files
- `prisma/schema.prisma` - Add new models
- `src/components/forms/ClientForm.tsx` - Add GBP config section
- `vercel.json` - Add new cron job

---

## Questions Before Implementation

1. **Google Cloud Setup**: Do you have a Google Cloud project set up? We'll need to enable the Business Profile API and create OAuth credentials.

2. **Late GBP Connection**: Are your clients' GBP accounts already connected in Late? If so, we can skip the direct Google OAuth for posting and only use it for photos.

3. **Post Frequency**: What's the typical desired posting frequency? (daily, 2-3x week, weekly?)

4. **Priority**: Should I start with Phase 1 (MVP without photo fetching) or is photo integration critical from the start?
