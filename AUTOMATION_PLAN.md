# Automated Tue/Thu Content Generation - Implementation Plan

## Requirements Summary

1. **PAA Uniqueness**: Each PAA used only once per client (not repeated for different locations)
2. **Location Rotation**: Cycle through all service locations equally
3. **Dynamic Locations**: New locations auto-join rotation without breaking anything
4. **Client Opt-In**: Easy toggle for which clients get automated content
5. **Daily Report**: View what content was posted on any given day
6. **Skip Long Video**: Exclude long-form video from automation (no API yet)

---

## Data Model Changes

### Add to Client model:
```prisma
model Client {
  // ... existing fields ...

  // Automation Settings
  autoScheduleEnabled    Boolean   @default(false)    // Opt-in toggle
  autoScheduleFrequency  Int       @default(2)        // Posts per week (1 or 2)
  lastAutoScheduledAt    DateTime?                    // Track last automation run
}
```

### Add to ClientPAA model:
```prisma
model ClientPAA {
  // ... existing fields ...

  usedAt        DateTime?   // When this PAA was used (null = never used)
  usedCount     Int         @default(0)  // How many times used (for reporting)
}
```

### Add to ServiceLocation model:
```prisma
model ServiceLocation {
  // ... existing fields ...

  lastUsedAt    DateTime?   // When this location was last used for content
}
```

---

## Automation Logic

### PAA Selection Strategy
```
1. Get all active PAAs for client, ordered by priority
2. Filter to PAAs where usedAt is NULL (never used)
3. If all PAAs used, pick the one with oldest usedAt (recycle)
4. Mark selected PAA with usedAt = now()
```

### Location Rotation Strategy
```
1. Get all active locations for client
2. Sort by lastUsedAt ASC (null first, then oldest)
3. Pick the first one (least recently used)
4. After content created, update lastUsedAt = now()
```

### Weekly Automation Flow
```
CRON: Sunday 8 PM (or configurable)

For each client where autoScheduleEnabled = true:
  1. Get next Tuesday and Thursday dates
  2. Check if content already exists for those dates
  3. For each empty slot:
     a. Select next PAA (unused or oldest-used)
     b. Select next location (least recently used)
     c. Create ContentItem with:
        - status: SCHEDULED
        - scheduledDate: Tue or Thu
        - scheduledTime: client.preferredPublishTime
     d. Trigger generation (blog, images, social, podcast, short video)
        - Skip: long-form video
     e. Set status to REVIEW when generation complete
  4. Update client.lastAutoScheduledAt
```

---

## New API Endpoints

### 1. Toggle Auto-Schedule for Client
```
PATCH /api/clients/[id]/auto-schedule
Body: { enabled: boolean, frequency?: 1 | 2 }
```

### 2. Weekly Auto-Schedule Cron
```
POST /api/cron/auto-schedule-weekly
Header: Authorization: Bearer {CRON_SECRET}

- Runs Sunday evening
- Creates content for upcoming Tue/Thu
- Triggers generation pipeline (excluding long video)
```

### 3. Daily Content Report
```
GET /api/reports/daily-content?date=2026-01-03
Returns: {
  date: "2026-01-03",
  items: [
    {
      client: "ABC Auto Glass",
      question: "How much does windshield...",
      location: "Portland, OR",
      status: "PUBLISHED",
      publishedAt: "2026-01-03T09:00:00Z",
      urls: {
        blog: "https://...",
        podcast: "https://...",
        social: { facebook: "...", instagram: "..." }
      }
    }
  ],
  summary: {
    total: 5,
    published: 4,
    pending: 1
  }
}
```

---

## UI Changes

### 1. Client Settings Page - Add Auto-Schedule Section
```
┌─────────────────────────────────────────────┐
│ Automated Content Scheduling                │
├─────────────────────────────────────────────┤
│ [x] Enable automatic Tue/Thu content        │
│                                             │
│ Posts per week: [2 ▼] (Tue & Thu)           │
│                                             │
│ Publish time: [09:00] (America/Los_Angeles) │
│                                             │
│ PAA Queue: 12 unused / 15 total             │
│ Locations: 5 active                         │
│                                             │
│ Last auto-scheduled: Jan 5, 2026            │
└─────────────────────────────────────────────┘
```

### 2. New Report Page - /admin/reports/daily
```
┌─────────────────────────────────────────────┐
│ Daily Content Report                        │
├─────────────────────────────────────────────┤
│ Date: [January 3, 2026 ▼]  [Today] [◀ ▶]   │
├─────────────────────────────────────────────┤
│ 5 items scheduled for this day              │
│                                             │
│ ✓ ABC Auto Glass - Portland                 │
│   "How much does windshield replacement..." │
│   Blog ✓ | Podcast ✓ | Social ✓            │
│                                             │
│ ✓ XYZ Glass - Seattle                       │
│   "Can a cracked windshield be repaired..." │
│   Blog ✓ | Podcast ✓ | Social ✓            │
│                                             │
│ ○ Smith Auto Glass - Denver (REVIEW)        │
│   "What causes windshield cracks..."        │
│   Blog ✓ | Podcast ○ | Social ○            │
└─────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Database & Core Logic
1. Add new fields to Prisma schema (Client, ClientPAA, ServiceLocation)
2. Run migration
3. Create `/lib/automation/paa-selector.ts` - PAA selection logic
4. Create `/lib/automation/location-rotator.ts` - Location rotation logic

### Phase 2: Cron Job
5. Create `/api/cron/auto-schedule-weekly/route.ts`
6. Integrate with existing generation pipeline
7. Add long-video skip flag to generation

### Phase 3: Client Settings UI
8. Add auto-schedule toggle to client settings page
9. Show PAA queue status and location count

### Phase 4: Reporting
10. Create `/api/reports/daily-content/route.ts`
11. Create `/admin/reports/daily/page.tsx` UI

### Phase 5: Testing & Polish
12. Test with one client
13. Add error handling and logging
14. Add email notifications for failures (optional)

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| All PAAs used | Recycle from oldest-used PAA |
| New location added | Joins rotation automatically (lastUsedAt = null) |
| New PAA added | Joins queue automatically (usedAt = null) |
| Client has no PAAs | Skip client, log warning |
| Client has no locations | Use client's default city/state |
| Generation fails | Set status to FAILED, don't block other clients |
| Content already exists for date | Skip that date slot |

---

## Questions Before Implementation

1. **Publish time**: Should all clients publish at their `preferredPublishTime`, or should we stagger them (e.g., 9am, 9:15am, 9:30am) to avoid API rate limits?

2. **Failure notifications**: Want email/Slack alerts when automation fails for a client?

3. **PAA exhaustion**: When a client runs out of PAAs (all recycled), should we alert you or just keep recycling?
