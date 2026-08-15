import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Local rank tracking via LocalDominator.
 *
 * A geogrid scan searches a keyword from many points around a business and
 * records who ranks where. What it is FOR here is not optimisation — for a
 * single-location glass shop the answer to a bad grid is almost always "post
 * to your Business Profile and get reviews" — it is evidence. A heatmap that
 * improves over twelve weeks is what makes an SEO retainer defensible, and a
 * mediocre one is the conversation that sells the retainer in the first
 * place. So the series matters more than any single scan.
 *
 * LocalDominator runs the schedule (a five-field cron on their side) and
 * POSTs each completed run to our webhook, so we neither poll nor schedule.
 */

const API_BASE = 'https://api.localdominator.co'

/** Scan shape per tier. SEO clients get depth; everyone else gets a look. */
export const SCAN_PRESETS = {
  // `distance` is METRES between adjacent pins, per their docs — not the
  // width of the grid. A 10x10 has NINE gaps across, so 1207m (0.75 miles)
  // spans 10.9km, about 6.75 miles corner to corner.
  seo: { gridSize: 10, distance: 1207, cron: '0 6 * * 1', maxKeywords: 4 },
  standard: { gridSize: 10, distance: 1207, cron: '0 6 1 * *', maxKeywords: 2 },
} as const

export type ScanTier = keyof typeof SCAN_PRESETS

/**
 * Default keywords, in priority order — the admin card prefills these and
 * they stay editable per client.
 *
 * Deliberately BARE head terms: no city, no "near me". A geogrid already
 * supplies the location, because every pin searches as if standing there.
 * Adding "denver" to the phrase tracks a different and less representative
 * SERP than the one a real customer in Denver sees, and "near me" is the pin
 * restated. City modifiers belong in classic SERP tracking, not here.
 *
 * ADAS calibration is deliberately absent: near-zero consumer awareness
 * means almost nobody searches it before a shop has told them they need it,
 * so it measures nothing about visibility to new customers.
 */
const CORE_KEYWORDS = ['windshield replacement', 'auto glass repair'] as const

/** Third and fourth slots, chosen from what the shop can actually service. */
const MOBILE_KEYWORD = 'mobile windshield replacement'
const SIDE_GLASS_KEYWORD = 'car window repair'
/** Stand-ins when a shop does not offer the service above. */
const FALLBACK_KEYWORDS = ['cracked windshield', 'windshield repair'] as const

export interface KeywordContext {
  offersMobileService?: boolean
  offersSideWindowRepair?: boolean
}

/**
 * Suggested keywords for a client: the first two always, then the two that
 * depend on what they sell.
 *
 * Tracking a service the shop does not offer is worse than tracking nothing.
 * It spends credits on a term they cannot win, and it drags the grid down for
 * a reason that has nothing to do with their SEO — which is exactly the wrong
 * signal in a chart whose whole job is showing whether the work is paying off.
 */
export function suggestedKeywords(tier: ScanTier, ctx: KeywordContext = {}): string[] {
  const fallbacks = [...FALLBACK_KEYWORDS]
  const pick = (offered: boolean | undefined, keyword: string) =>
    offered === false ? fallbacks.shift() || keyword : keyword

  const all = [
    ...CORE_KEYWORDS,
    pick(ctx.offersMobileService, MOBILE_KEYWORD),
    pick(ctx.offersSideWindowRepair, SIDE_GLASS_KEYWORD),
  ]
  return all.slice(0, SCAN_PRESETS[tier].maxKeywords)
}

export async function localDominatorKey(): Promise<string | null> {
  const row = await prisma.setting
    .findUnique({ where: { key: 'LOCALDOMINATOR_API_KEY' } })
    .catch(() => null)
  if (row?.value) return row.encrypted ? decrypt(row.value) : row.value
  return process.env.LOCALDOMINATOR_API_KEY || null
}

/**
 * The white-label host their share links are served from, e.g.
 * `ranking.autoglassmarketingpros.com`. A setting rather than a constant
 * because it is OUR domain, not theirs, and it can change.
 */
export async function localDominatorShareHost(): Promise<string | null> {
  const row = await prisma.setting
    .findUnique({ where: { key: 'LOCALDOMINATOR_SHARE_HOST' } })
    .catch(() => null)
  const raw = (row?.value || process.env.LOCALDOMINATOR_SHARE_HOST || '').trim()
  if (!raw) return null
  // Host only. Anything with a slash or a scheme is a configuration mistake
  // that would otherwise become an iframe src.
  const host = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
}

async function ldFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = await localDominatorKey()
  if (!key) throw new Error('LOCALDOMINATOR_API_KEY is not configured')
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
}

export interface ScheduledScanInput {
  googlePlaceId: string
  latitude: number
  longitude: number
  searchTerms: string[]
  tier: ScanTier
  webhookUrl: string
  alias?: string
}

/**
 * Create the recurring campaign. Returns the provider's scheduled_scan_id,
 * which we store on the client so the campaign can later be updated or
 * deleted rather than duplicated.
 */
export async function createScheduledScan(
  input: ScheduledScanInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const preset = SCAN_PRESETS[input.tier]
  const terms = input.searchTerms.map((t) => t.trim()).filter(Boolean).slice(0, preset.maxKeywords)
  if (terms.length === 0) return { ok: false, error: 'At least one keyword is required.' }

  try {
    const res = await ldFetch('/v1/scheduled-scans', {
      method: 'POST',
      body: JSON.stringify({
        google_place_id: input.googlePlaceId,
        latitude: input.latitude,
        longitude: input.longitude,
        shape: 'square',
        distance: preset.distance,
        grid_size: preset.gridSize,
        search_terms: terms,
        scheduling: preset.cron,
        webhook_url: input.webhookUrl,
        preschedule_analysis: true,
        run_now: true,
        ...(input.alias ? { alias: input.alias } : {}),
      }),
    })
    const body = await res.json().catch(() => null)
    // 202 is documented as accepted-for-async: the row may not exist yet,
    // but the id is returned and the webhook will deliver the run.
    if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
      return { ok: false, error: describeError(res.status, body) }
    }
    const id = body?.id || body?.scheduled_scan_id || body?.data?.id
    if (!id) return { ok: false, error: 'LocalDominator accepted the scan but returned no id.' }
    return { ok: true, id: String(id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

/**
 * Change an existing campaign's grid without recreating it.
 *
 * PATCH keeps the campaign's id, its history and its webhook — deleting and
 * recreating would orphan every stored run against a scheduled_scan_id that
 * no longer exists, and spend a fresh run's credits to get back to where it
 * already was.
 */
export async function updateScheduledScanGrid(
  id: string,
  grid: { distance?: number; gridSize?: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: Record<string, number> = {}
  if (grid.distance !== undefined) body.distance = grid.distance
  if (grid.gridSize !== undefined) body.grid_size = grid.gridSize
  if (Object.keys(body).length === 0) return { ok: false, error: 'Nothing to change.' }

  try {
    const res = await ldFetch(`/v1/scheduled-scans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true }
    const detail = await res.json().catch(() => null)
    return { ok: false, error: describeError(res.status, detail) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

/**
 * The campaign-wide share link for a scheduled scan.
 *
 * This is the map their own dashboard shows: every keyword, every run, with
 * the date control built in — `share_links.campaign_link` on the campaign
 * object. It never appears in the webhook payload, which only ever carries
 * the per-run `image_link` and `dynamic_url`, so it has to be fetched.
 *
 * Cached for an hour. It is derived from the newest notified run, so it does
 * change — but not within a page view, and their API is not free.
 */
export async function campaignShareLink(scheduledScanId: string): Promise<string | null> {
  try {
    const key = await localDominatorKey()
    if (!key) return null
    const res = await fetch(
      `${API_BASE}/v1/scheduled-scans/${encodeURIComponent(scheduledScanId)}?date_range=MAX`,
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        next: { revalidate: 3_600 },
      }
    )
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const links = (body?.share_links || {}) as Record<string, unknown>
    const link = links.campaign_link
    return typeof link === 'string' && link ? link : null
  } catch {
    return null
  }
}

export async function deleteScheduledScan(id: string): Promise<boolean> {
  try {
    const res = await ldFetch(`/v1/scheduled-scans/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

function describeError(status: number, body: unknown): string {
  const message =
    (body as { message?: string; error?: string } | null)?.message ||
    (body as { error?: string } | null)?.error ||
    ''
  if (status === 401 || status === 403) return 'LocalDominator rejected the API key.'
  if (status === 402) return 'LocalDominator reports insufficient credits for this scan.'
  if (status === 429) return 'LocalDominator rate limit hit — try again shortly.'
  return message || `LocalDominator returned ${status}.`
}

/* ------------------------------------------------------------------ grid */

export interface HeatmapRecord {
  scanId?: number
  compressed_grid?: number[][][]
  detailsArray?: Array<{ placeId?: string; name?: string }>
  [key: string]: unknown
}

/**
 * What a delivered scan record actually contains.
 *
 * The webhook does NOT deliver the documented `ResultsJson` shape. A real
 * record is richer: it carries the keyword, the business's own place id, the
 * grid geometry, an average rank Local Dominator has already computed, and a
 * link to their rendered heatmap image. The grid itself is `content`, not
 * `compressed_grid`.
 *
 * Reading their `average_rank` rather than recomputing one is deliberate: it
 * is the number their own dashboard shows, and a report that disagreed with
 * the tool it came from would be indefensible in front of a client.
 */
export interface ScanRecord {
  keyword: string | null
  placeId: string | null
  averageRank: number | null
  gridSize: number | null
  distance: number | null
  centerLat: number | null
  centerLng: number | null
  /** Local Dominator's own rendered heatmap. */
  mapImageUrl: string | null
  shareUrl: string | null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

export function readScanRecord(record: HeatmapRecord): ScanRecord {
  const share = (record.share_links || {}) as Record<string, unknown>
  return {
    keyword: str(record.keyword) || str(record.search_term) || str(record.searchTerm),
    placeId: str(record.place_id) || str(record.placeId),
    averageRank: num(record.average_rank) ?? num(record.averageRank),
    gridSize: num(record.grid_size) ?? num(record.gridSize),
    distance: num(record.locations_distance) ?? num(record.distance),
    centerLat: num(record.center_lat),
    centerLng: num(record.center_lng),
    mapImageUrl: str(share.image_link) || str(share.imageLink),
    shareUrl: str(share.dynamic_url) || str(share.dynamicUrl),
  }
}

/**
 * Find the grid and the business list inside a payload.
 *
 * The documented shape puts `compressed_grid` and `detailsArray` at the top
 * of each heatmap record, but a webhook payload can wrap them a level or two
 * deeper, and a reader that only looks in the documented place produces
 * empty numbers rather than an error — which is worse, because it looks like
 * "not ranking anywhere" instead of "we failed to read this".
 *
 * So both are located wherever they are. They are searched independently
 * because nothing guarantees they sit in the same object.
 */
function locate(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== 'object' || depth > 4) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = locate(item, key, depth + 1)
      if (hit) return hit
    }
    return null
  }
  const obj = node as Record<string, unknown>
  if (Array.isArray(obj[key])) return obj[key]
  for (const value of Object.values(obj)) {
    const hit = locate(value, key, depth + 1)
    if (hit) return hit
  }
  return null
}

/**
 * Per-point ranks from a delivered record's `content`.
 *
 * The real payload is not the documented compressed grid. `content` is one
 * entry per row, each an object keyed "0".."9", and each cell is a number.
 *
 * **The cell is a ZERO-INDEXED position: 0 is first place.** This cost two
 * wrong reports before the whole matrix was logged and the arithmetic settled
 * it. A delivered 10x10 read [0,1,1,1,1,1,2,3,4,4] across its first row and
 * every other row likewise; the hundred cells summed to 113, and the record's
 * own `average_rank` was 1.13 — exactly the mean of every cell including the
 * zeros. A value a provider averages into a rank is a rank, not an absence.
 * Their docs confirm the other half: a point with no data is delivered as
 * `null`, never as 0. So 0 + 1 = position 1, and the shop's own doorstep —
 * the centre of a grid drawn around it — comes out best, which is what a
 * geogrid centred on a business must look like.
 *
 * Reading 0 as "did not appear" inverted the map: the centre went grey and
 * the far edge went green. It looked like data, which is why it survived two
 * rounds. Do not reintroduce it.
 */
export function ranksFromContent(record: HeatmapRecord): Array<Array<number | null>> {
  const content = (record as Record<string, unknown>).content
  if (!Array.isArray(content) || content.length === 0) return []

  const rank = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v + 1 : null

  return content.map((row) => {
    if (Array.isArray(row)) return row.map(rank)
    if (!row || typeof row !== 'object') return []
    const cells = row as Record<string, unknown>
    // Numeric keys, in numeric order — "10" must not sort before "2".
    return Object.keys(cells)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => rank(cells[k]))
  })
}

/** Summary from a rank grid we have already decoded. */
export function summarizeRanks(grid: Array<Array<number | null>>): RankSummary | null {
  let points = 0
  let found = 0
  let top3 = 0
  let top10 = 0
  let rankSum = 0
  for (const row of grid) {
    for (const rank of row) {
      points++
      if (rank === null) continue
      found++
      rankSum += rank
      if (rank <= 3) top3++
      if (rank <= 10) top10++
    }
  }
  if (points === 0) return null
  const pct = (n: number) => Math.round((n / points) * 1000) / 10
  return {
    averageRank: found > 0 ? Math.round((rankSum / found) * 10) / 10 : null,
    top3Percent: pct(top3),
    top10Percent: pct(top10),
    foundPercent: pct(found),
    points,
  }
}

export interface LocatedGrid {
  grid: number[][][]
  details: Array<{ placeId?: string }>
}

export function locateHeatmap(record: HeatmapRecord): LocatedGrid | null {
  const grid = locate(record, 'compressed_grid') as number[][][] | null
  const details = locate(record, 'detailsArray') as Array<{ placeId?: string }> | null
  if (!Array.isArray(grid) || !Array.isArray(details)) return null
  return { grid, details }
}

export interface RankSummary {
  /** Mean position across the points where the business appeared at all. */
  averageRank: number | null
  top3Percent: number
  top10Percent: number
  /** Share of grid points where the business appeared anywhere in results. */
  foundPercent: number
  points: number
}

/**
 * Reduce one keyword's grid to this business's numbers.
 *
 * The payload is compressed: each grid cell is an array of INDICES into
 * `detailsArray`, ordered by rank. So the business's rank at a point is the
 * position of its index within that cell — not the value stored there. Read
 * it the obvious way round and every number comes out wrong but plausible,
 * which is the worst kind of wrong for a chart a client is shown.
 *
 * `averageRank` deliberately averages only the points where the business
 * ranked. Treating "absent" as a large number would let one scan's coverage
 * change swamp the trend; absence is reported separately as foundPercent,
 * which is the honest way to show "you are invisible over here".
 */
export function summarizeGrid(record: HeatmapRecord, placeId: string): RankSummary | null {
  const fromContent = ranksFromContent(record)
  if (fromContent.length > 0) return summarizeRanks(fromContent)

  const located = locateHeatmap(record)
  if (!located) return null
  const { grid, details } = located

  const selfIndex = details.findIndex((d) => d?.placeId === placeId)
  let points = 0
  let found = 0
  let top3 = 0
  let top10 = 0
  let rankSum = 0

  for (const row of grid) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (!Array.isArray(cell)) continue
      points++
      if (selfIndex < 0) continue
      const at = cell.indexOf(selfIndex)
      if (at < 0) continue
      const rank = at + 1
      found++
      rankSum += rank
      if (rank <= 3) top3++
      if (rank <= 10) top10++
    }
  }

  if (points === 0) return null
  const pct = (n: number) => Math.round((n / points) * 1000) / 10
  return {
    averageRank: found > 0 ? Math.round((rankSum / found) * 10) / 10 : null,
    top3Percent: pct(top3),
    top10Percent: pct(top10),
    foundPercent: pct(found),
    points,
  }
}

/**
 * This business's rank at every grid point, row by row, for drawing a
 * heatmap. `null` means it did not appear at that point at all — which is
 * the most important cell on the map and must never be shown as a zero or
 * quietly dropped.
 */
export function gridRanks(record: HeatmapRecord, placeId: string): Array<Array<number | null>> {
  const fromContent = ranksFromContent(record)
  if (fromContent.length > 0) return fromContent

  const located = locateHeatmap(record)
  if (!located) return []
  const { grid, details } = located
  const selfIndex = details.findIndex((d) => d?.placeId === placeId)
  return grid.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => {
          if (selfIndex < 0 || !Array.isArray(cell)) return null
          const at = cell.indexOf(selfIndex)
          return at < 0 ? null : at + 1
        })
      : []
  )
}

/** The keyword a heatmap record belongs to, across the field names seen. */
export function searchTermOf(record: HeatmapRecord): string | null {
  for (const key of ['searchTerm', 'search_term', 'keyword', 'term', 'query']) {
    const v = record[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
