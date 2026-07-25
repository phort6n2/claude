// ============================================
// DIRECTORY — RANK HISTORY & MOVEMENT TRIGGERS
// ============================================
// WRHQ already orders every shop within its city, so we're sitting on each
// shop's relative position in every market. This turns that into a time series:
// snapshot all ranks on a schedule, diff against the previous snapshot, and
// record movement events.
//
// The payoff is the "you just got passed" trigger — loss aversion is sharpest
// right after a drop, which makes it the single best moment to reach out. The
// events also give the operator a live feed of who's moving in which market.
//
// Storage (Vercel Blob, one small doc each — cheap to read and diff):
//   directory/rank-history/latest.json  → { takenAt, ranks: { slug: {...} } }
//   directory/rank-history/events.json  → the most recent movement events
//
// Everything degrades to a no-op without a Blob store.

import { list, put } from '@vercel/blob'
import { blobEnabled } from './blob'
import { getCitySummaries, getShopsByCity, citySlug } from './data'
import { hydrateDirectory } from './listings'

const PREFIX = 'directory/rank-history'
const LATEST_PATH = `${PREFIX}/latest.json`
const EVENTS_PATH = `${PREFIX}/events.json`
/** Keep the feed bounded — plenty of history for outreach without unbounded growth. */
const MAX_EVENTS = 500

export interface RankEntry {
  rank: number
  total: number
  city: string
  state: string
  name: string
}

export interface RankSnapshot {
  takenAt: string
  ranks: Record<string, RankEntry>
}

export interface RankEvent {
  slug: string
  name: string
  city: string
  state: string
  /** Previous rank → new rank. Lower is better, so to > from is a DROP. */
  from: number
  to: number
  total: number
  direction: 'dropped' | 'gained'
  /** Shops that overtook this one (only on a drop). */
  passedBy?: { slug: string; name: string }[]
  at: string
}

export interface SnapshotReport {
  ok: boolean
  takenAt: string
  shops: number
  /** False on the very first run — nothing to diff against yet. */
  compared: boolean
  dropped: number
  gained: number
  events: RankEvent[]
}

// ---- storage --------------------------------------------------------------

async function readJson<T>(path: string): Promise<T | null> {
  if (!blobEnabled()) return null
  try {
    const { blobs } = await list({ prefix: path })
    const hit = blobs.find((b) => b.pathname === path)
    if (!hit) return null
    const res = await fetch(hit.url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  if (!blobEnabled()) return
  await put(path, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export function getLatestSnapshot(): Promise<RankSnapshot | null> {
  return readJson<RankSnapshot>(LATEST_PATH)
}

export async function getRankEvents(limit = 50): Promise<RankEvent[]> {
  const events = (await readJson<RankEvent[]>(EVENTS_PATH)) ?? []
  return events.slice(0, limit)
}

/** Current rank for one shop, straight from the last snapshot. */
export async function getStoredRank(slug: string): Promise<RankEntry | null> {
  const snap = await getLatestSnapshot()
  return snap?.ranks[slug] ?? null
}

// ---- snapshot + diff ------------------------------------------------------

/**
 * Rank every shop in every city in one pass. getCityRank() would re-sort the
 * city for each shop; this sorts each city once (320+ shops, so it matters).
 */
function currentRanks(): Record<string, RankEntry> {
  const ranks: Record<string, RankEntry> = {}
  const seen = new Set<string>()
  for (const summary of getCitySummaries()) {
    const key = `${summary.state}/${summary.citySlug}`
    if (seen.has(key)) continue
    seen.add(key)
    const shops = getShopsByCity(summary.state, summary.city)
    shops.forEach((s, i) => {
      ranks[s.slug] = {
        rank: i + 1,
        total: shops.length,
        city: s.city,
        state: s.state,
        name: s.name,
      }
    })
  }
  return ranks
}

/** Who overtook `slug`: shops now above it that were below it before. */
function whoPassed(
  slug: string,
  prev: Record<string, RankEntry>,
  next: Record<string, RankEntry>
): { slug: string; name: string }[] {
  const before = prev[slug]
  const after = next[slug]
  if (!before || !after) return []
  const cityKey = `${after.state}/${citySlug(after.city)}`
  const out: { slug: string; name: string }[] = []
  for (const [otherSlug, entry] of Object.entries(next)) {
    if (otherSlug === slug) continue
    if (`${entry.state}/${citySlug(entry.city)}` !== cityKey) continue
    const otherBefore = prev[otherSlug]
    if (!otherBefore) continue
    // Was behind us, is now ahead of us.
    if (otherBefore.rank > before.rank && entry.rank < after.rank) {
      out.push({ slug: otherSlug, name: entry.name })
    }
  }
  return out.slice(0, 3)
}

/**
 * Take a snapshot, diff it against the previous one, and persist both the new
 * snapshot and any movement events. Returns the events found (empty on the
 * first ever run, since there's nothing to compare against).
 */
export async function snapshotRanks(
  opts: { dryRun?: boolean } = {}
): Promise<SnapshotReport> {
  await hydrateDirectory()
  const takenAt = new Date().toISOString()
  const ranks = currentRanks()
  const previous = await getLatestSnapshot()

  const events: RankEvent[] = []
  if (previous) {
    for (const [slug, entry] of Object.entries(ranks)) {
      const before = previous.ranks[slug]
      if (!before) continue // new listing — no movement to report
      if (before.rank === entry.rank) continue
      const dropped = entry.rank > before.rank
      events.push({
        slug,
        name: entry.name,
        city: entry.city,
        state: entry.state,
        from: before.rank,
        to: entry.rank,
        total: entry.total,
        direction: dropped ? 'dropped' : 'gained',
        ...(dropped ? { passedBy: whoPassed(slug, previous.ranks, ranks) } : {}),
        at: takenAt,
      })
    }
  }

  if (!opts.dryRun && blobEnabled()) {
    await writeJson(LATEST_PATH, { takenAt, ranks } satisfies RankSnapshot)
    if (events.length) {
      const existing = (await readJson<RankEvent[]>(EVENTS_PATH)) ?? []
      await writeJson(EVENTS_PATH, [...events, ...existing].slice(0, MAX_EVENTS))
    }
  }

  return {
    ok: true,
    takenAt,
    shops: Object.keys(ranks).length,
    compared: !!previous,
    dropped: events.filter((e) => e.direction === 'dropped').length,
    gained: events.filter((e) => e.direction === 'gained').length,
    events,
  }
}
