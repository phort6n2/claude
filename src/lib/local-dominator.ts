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
  seo: { gridSize: 10, distance: 500, cron: '0 6 * * 1', maxKeywords: 4 },
  standard: { gridSize: 10, distance: 500, cron: '0 6 1 * *', maxKeywords: 2 },
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
  const grid = record.compressed_grid
  const details = record.detailsArray
  if (!Array.isArray(grid) || !Array.isArray(details)) return null

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

/** The keyword a heatmap record belongs to, across the field names seen. */
export function searchTermOf(record: HeatmapRecord): string | null {
  for (const key of ['searchTerm', 'search_term', 'keyword', 'term', 'query']) {
    const v = record[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
