import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Read Clarity's aggregates back.
 *
 * WHAT THIS CANNOT DO, stated up front because designing around the wrong
 * belief is the expensive mistake here: **the API returns aggregates, not
 * recordings.** Session replays and heatmaps are dashboard-only, human-eye
 * things. Anything that needs a replay watched is a thing a person watches.
 * A loop built on "the model reviews the session recordings" would be a loop
 * that quietly invents its findings.
 *
 * It is also rate limited to a handful of calls per project per day, over the
 * last three days only, so this is a thing to call deliberately — daily at
 * most — and store, not something to poll.
 *
 * The metric that decides whether any of it worked is NOT in here. It is
 * conversion rate in Google Ads, on SEARCH campaigns, because PMax mixes
 * placements and audiences the landing page did not cause and cannot be held
 * responsible for. Clarity says what people did on the page; Ads says whether
 * it turned into money. The join is the `paid_click` tag on this side and the
 * click id riding with every lead on the other.
 */

/**
 * Pull the project id out of whatever the operator pasted.
 *
 * Clarity hands you a `<script>` block, not an id, so demanding the bare code
 * means reading the snippet and picking the right one of its several quoted
 * strings — with "clarity" and "script" sitting right next to the one you
 * want. Accepting the snippet is the difference between a field that works on
 * the first try and one that rejects the thing the vendor actually gave you.
 *
 * Handles: the bare id, the full tracking snippet, the tag URL, and a
 * dashboard URL. Returns null when there is no id in there at all, so a
 * genuine mistake is still refused rather than saved as nonsense.
 */
export function extractClarityProjectId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Already an id.
  if (/^[a-z0-9]{6,20}$/i.test(raw)) return raw.toLowerCase()

  // The tag URL, in a snippet or on its own: clarity.ms/tag/{id}
  const fromTag = /clarity\.ms\/tag\/([a-z0-9]{6,20})/i.exec(raw)
  if (fromTag) return fromTag[1].toLowerCase()

  // A dashboard URL: clarity.microsoft.com/projects/view/{id}/...
  const fromDashboard = /clarity\.microsoft\.com\/projects\/view\/([a-z0-9]{6,20})/i.exec(raw)
  if (fromDashboard) return fromDashboard[1].toLowerCase()

  // The snippet's last argument: (window, document, "clarity", "script", "{id}")
  // Anchored on the "script" argument so the literal words "clarity" and
  // "script" in the same call cannot be mistaken for the id.
  const fromSnippet = /["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/i.exec(raw)
  if (fromSnippet) return fromSnippet[1].toLowerCase()

  return null
}

const EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'
/** Their documented ceiling. Older data is dashboard-only. */
export const MAX_DAYS = 3

/** The breakdowns worth asking for, given the tags the pages set. */
export type ClarityDimension = 'URL' | 'Device' | 'OS' | 'Browser' | 'Country' | 'Source'

export interface ClarityMetric {
  metricName: string
  information: Array<Record<string, string | number>>
}

export interface ClarityResult {
  ok: boolean
  message: string
  metrics: ClarityMetric[]
}

async function tokenFor(clientId: string): Promise<string | null> {
  const client = await prisma.client
    .findUnique({ where: { id: clientId }, select: { clarityApiToken: true } })
    .catch(() => null)
  return client?.clarityApiToken ? decrypt(client.clarityApiToken) : null
}

/**
 * One day's aggregates for one shop.
 *
 * `numOfDays` is 1-3. Two dimensions maximum per call, which is why the tags
 * matter: without them every row is the whole site at once.
 */
export async function fetchClarityInsights(
  clientId: string,
  options: { days?: number; dimensions?: ClarityDimension[] } = {}
): Promise<ClarityResult> {
  const token = await tokenFor(clientId)
  if (!token) {
    return { ok: false, message: 'No Clarity export token saved for this shop.', metrics: [] }
  }

  const days = Math.min(Math.max(options.days ?? 1, 1), MAX_DAYS)
  const params = new URLSearchParams({ numOfDays: String(days) })
  options.dimensions?.slice(0, 2).forEach((dimension, i) => {
    params.set(`dimension${i + 1}`, dimension)
  })

  try {
    const res = await fetch(`${EXPORT_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Clarity rejected the token — generate a new one.', metrics: [] }
    }
    // Their limit is per project per day, so backing off and retrying inside
    // one request would just spend the same allowance twice.
    if (res.status === 429) {
      return {
        ok: false,
        message: 'Clarity rate limit reached for today on this project. Try tomorrow.',
        metrics: [],
      }
    }
    if (!res.ok) {
      return { ok: false, message: `Clarity returned ${res.status}.`, metrics: [] }
    }
    const body = (await res.json().catch(() => null)) as ClarityMetric[] | null
    if (!Array.isArray(body)) {
      return { ok: false, message: 'Clarity answered with something unreadable.', metrics: [] }
    }
    return {
      ok: true,
      message: body.length
        ? `${body.length} metric${body.length === 1 ? '' : 's'} over the last ${days} day${days === 1 ? '' : 's'}.`
        : 'Connected, but Clarity has no data for this project yet.',
      metrics: body,
    }
  } catch {
    return { ok: false, message: 'Could not reach Clarity.', metrics: [] }
  }
}

/**
 * The behavioural signals worth acting on, pulled out of the metric soup.
 *
 * Deliberately a small set. Clarity reports a lot; these are the ones that
 * point at something fixable on a landing page rather than at traffic mix —
 * a dead click is a thing that looks tappable and is not, a rage click is the
 * same thing after the visitor has lost patience, and a quickback is a page
 * that answered the wrong question.
 */
export const ACTIONABLE_METRICS = [
  'DeadClickCount',
  'RageClickCount',
  'QuickbackClick',
  'ScrollDepth',
  'ExcessiveScroll',
  'Traffic',
] as const

export function summarise(metrics: ClarityMetric[]): Array<{ name: string; total: number }> {
  const wanted = new Set<string>(ACTIONABLE_METRICS)
  return metrics
    .filter((m) => wanted.has(m.metricName))
    .map((m) => ({
      name: m.metricName,
      total: m.information.reduce((sum, row) => {
        const value = row.sessionsCount ?? row.subTotal ?? row.sessionsWithMetricPercentage
        return sum + (typeof value === 'number' ? value : Number(value) || 0)
      }, 0),
    }))
}

/** Pull one number out of the metric soup, whatever shape the rows take. */
function totalFor(metrics: ClarityMetric[], name: string): number | null {
  const metric = metrics.find((m) => m.metricName === name)
  if (!metric || !Array.isArray(metric.information)) return null
  let total = 0
  let seen = false
  for (const row of metric.information) {
    const value = row.sessionsCount ?? row.subTotal ?? row.sessionsWithMetricPercentage
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n)) {
      total += n
      seen = true
    }
  }
  return seen ? total : null
}

export interface ClaritySyncResult {
  ok: boolean
  message: string
  stored: number
  skipped: number
}

/**
 * Copy yesterday out of Clarity before it ages off.
 *
 * WHY THIS RUNS ON A SCHEDULE rather than on demand: their export API serves
 * the LAST THREE DAYS and nothing older, at a handful of calls per project per
 * day. A week-old Tuesday cannot be fetched at any price — it exists only in
 * their dashboard, for a person to read by eye. So the history has to be
 * accumulated as it happens, or there is no history to reason about at all.
 *
 * One call per shop per night, well inside their limit. A shop with a project
 * id but no export token is skipped rather than failed: the tag is collecting
 * either way, and the token is the optional half.
 */
export async function syncClarityHistory(clientId?: string): Promise<ClaritySyncResult> {
  const clients = await prisma.client
    .findMany({
      where: {
        ...(clientId ? { id: clientId } : { status: 'ACTIVE' }),
        clarityProjectId: { not: null },
        clarityApiToken: { not: null },
      },
      select: { id: true, businessName: true },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return {
      ok: true,
      stored: 0,
      skipped: 0,
      message: 'No shops have both a Clarity project id and an export token.',
    }
  }

  // Yesterday, at midnight UTC. Yesterday rather than today because today is
  // still accumulating and would be rewritten by tomorrow's run with a
  // different, larger number for the same date.
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - 1)
  day.setUTCHours(0, 0, 0, 0)

  let stored = 0
  let skipped = 0
  const failures: string[] = []

  for (const client of clients) {
    const existing = await prisma.clarityDay
      .findUnique({ where: { clientId_day: { clientId: client.id, day } } })
      .catch(() => null)
    // Already have it. Re-fetching would spend one of the day's few calls to
    // overwrite a row with the same numbers.
    if (existing) {
      skipped++
      continue
    }

    const result = await fetchClarityInsights(client.id, { days: 1, dimensions: ['URL', 'Device'] })
    if (!result.ok) {
      failures.push(`${client.businessName}: ${result.message}`)
      continue
    }

    await prisma.clarityDay
      .create({
        data: {
          clientId: client.id,
          day,
          sessions: totalFor(result.metrics, 'Traffic'),
          deadClicks: totalFor(result.metrics, 'DeadClickCount'),
          rageClicks: totalFor(result.metrics, 'RageClickCount'),
          quickbacks: totalFor(result.metrics, 'QuickbackClick'),
          scrollDepth: totalFor(result.metrics, 'ScrollDepth'),
          raw: result.metrics as unknown as object,
        },
      })
      .then(() => {
        stored++
      })
      .catch((err) => {
        failures.push(`${client.businessName}: could not store (${err?.message || 'unknown'})`)
      })
  }

  const parts = [`${stored} day(s) stored`]
  if (skipped) parts.push(`${skipped} already had it`)
  if (failures.length) parts.push(`failed: ${failures.join('; ')}`)

  return { ok: failures.length === 0, stored, skipped, message: parts.join(', ') + '.' }
}
