import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * BabyLoveGrowth — the SEO article writer behind the $497 tier's content.
 *
 * Pull-based: nothing is pushed to us, so a scheduled sync copies articles
 * into our own table and the hosted sites serve them from there. Their own
 * docs are explicit that the API is rate limited and must not be called per
 * page view, and a shop's site must not go dark because a content vendor is
 * having an afternoon.
 *
 * The list endpoint returns summaries only — no body. Full content needs a
 * second call per article, which is why the sync fetches bodies only for
 * articles it has not already stored.
 */

const BASE = 'https://api.babylovegrowth.ai/api/integrations/v1'
/** Their documented ceiling. */
const MAX_LIMIT = 50

export interface BlgArticleSummary {
  id: number | string
  title?: string
  slug?: string
  hero_image_url?: string
  languageCode?: string
  meta_description?: string
  excerpt?: string
  orgWebsite?: string
  created_at?: string
  seedKeyword?: string
  keywords?: string[]
}

export interface BlgArticle extends BlgArticleSummary {
  content_markdown?: string
  content_html?: string
  jsonLd?: unknown
  faqJsonLd?: unknown
}

export async function getApiKey(): Promise<string | null> {
  const setting = await prisma.setting
    .findUnique({ where: { key: 'BABYLOVEGROWTH_API_KEY' } })
    .catch(() => null)
  const value = setting?.encrypted ? decrypt(setting.value) : setting?.value
  return value || process.env.BABYLOVEGROWTH_API_KEY || null
}

class BlgError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/**
 * One request, with backoff on 429 only.
 *
 * A 401 is a wrong key and a 404 is a wrong id — retrying either just burns
 * the rate limit that caused the problem, so only the rate limit itself is
 * retried.
 */
async function request<T>(path: string, apiKey: string): Promise<T> {
  let delay = 1_000
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) return (await res.json()) as T
    if (res.status !== 429 || attempt === 3) {
      const body = await res.text().catch(() => '')
      throw new BlgError(
        res.status === 401
          ? 'BabyLoveGrowth rejected the API key (401).'
          : `BabyLoveGrowth returned ${res.status}. ${body.slice(0, 200)}`,
        res.status
      )
    }
    await new Promise((r) => setTimeout(r, delay))
    delay *= 2
  }
  throw new BlgError('BabyLoveGrowth was rate limited on every attempt.', 429)
}

/** Every article summary, oldest call first, paging until a short page. */
export async function listAllArticles(apiKey: string): Promise<BlgArticleSummary[]> {
  const all: BlgArticleSummary[] = []
  let offset = 0
  // A guard, not a limit: 40 pages is 2000 articles, far past any real
  // account, and it stops a misbehaving `offset` from looping forever.
  for (let page = 0; page < 40; page++) {
    const batch = await request<BlgArticleSummary[]>(
      `/articles?limit=${MAX_LIMIT}&offset=${offset}`,
      apiKey
    )
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (batch.length < MAX_LIMIT) break
    offset += MAX_LIMIT
  }
  return all
}

export async function getArticle(id: string, apiKey: string): Promise<BlgArticle> {
  return request<BlgArticle>(`/articles/${encodeURIComponent(id)}`, apiKey)
}

/** Cheap credentials check for the admin settings page. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const apiKey = await getApiKey()
  if (!apiKey) {
    return { ok: false, message: 'No BabyLoveGrowth API key saved in Settings → API keys.' }
  }
  try {
    const batch = await request<BlgArticleSummary[]>('/articles?limit=1&offset=0', apiKey)
    return {
      ok: true,
      message: Array.isArray(batch) && batch.length
        ? `Connected. Newest article: “${batch[0].title || 'untitled'}”.`
        : 'Connected, but the account has no articles yet.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Request failed' }
  }
}
