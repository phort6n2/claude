import { prisma } from '@/lib/db'

/**
 * Per-city page content, and the bar a city page has to clear to be indexed.
 *
 * The problem this exists to solve, measured on a real client: two of their
 * city pages differed by four lines out of 294. Same services, same warranty,
 * same reviews, same process, with the city name swapped. That is the
 * textbook description of a doorway page, and Google treats a network of them
 * as an account-level problem rather than a per-page one.
 *
 * ---------------------------------------------------------------------------
 * Why thin pages are noindexed and NOT 404'd
 * ---------------------------------------------------------------------------
 * The instinct is to stop serving them. But an ad can already be pointing at
 * one, and a 404 on an ad's destination gets the ad disapproved — trading a
 * quality problem for an outage. Google's own remedy for a page that
 * shouldn't be in the index is to keep serving it and mark it noindex.
 *
 * So a city below the bar is still served, still converts, still accepts ad
 * traffic — it just doesn't claim to be an indexable page about that city,
 * isn't in the sitemap, and isn't linked from anywhere on the site.
 */

/**
 * Words of city-specific copy before a city page is worth indexing.
 *
 * Not a number Google publishes — nobody has one — but it is enough that the
 * page cannot be the template with a name swapped, which is the actual test.
 */
export const CITY_CONTENT_MIN_WORDS = 60

export interface CityContent {
  city: string
  heading: string | null
  body: string | null
  wordCount: number
  /** Enough unique copy to be worth indexing. */
  substantial: boolean
}

const norm = (value: string) => value.trim().toLowerCase()

export function countWords(text: string | null | undefined): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length
}

/** Everything the client has written per city, keyed by lowercase city name. */
export async function getCityContent(clientId: string): Promise<Map<string, CityContent>> {
  const rows = await prisma.clientCityContent.findMany({ where: { clientId } }).catch(() => [])
  const map = new Map<string, CityContent>()
  for (const row of rows) {
    const wordCount = countWords(row.body)
    map.set(norm(row.city), {
      city: row.city,
      heading: row.heading,
      body: row.body,
      wordCount,
      substantial: wordCount >= CITY_CONTENT_MIN_WORDS,
    })
  }
  return map
}

/**
 * Is this city page substantial enough to be indexed and linked?
 *
 * A city the client has a SHOP in always qualifies: a real address, real
 * hours and its own map are facts no other city's page carries, which is
 * exactly the uniqueness the rule is asking for.
 */
export function cityIsIndexable(
  city: string,
  content: Map<string, CityContent>,
  shopCities: string[]
): boolean {
  if (shopCities.some((shop) => norm(shop) === norm(city))) return true
  return content.get(norm(city))?.substantial === true
}

/**
 * FAQ entries safe to show on a city page.
 *
 * The FAQ is written about the client's home city, so a question reading
 * "how much does a windshield cost in Portland" appears verbatim on the
 * Beaverton page. Rewriting it would invent an answer for a city the client
 * never spoke about; dropping it is honest and removes a chunk of the
 * duplication at the same time.
 */
export function faqForCity<T extends { q: string; a: string }>(
  faq: T[],
  city: string,
  otherCities: string[]
): T[] {
  const foreign = otherCities.filter((other) => norm(other) !== norm(city))
  if (foreign.length === 0) return faq
  return faq.filter((item) => {
    const text = `${item.q} ${item.a}`.toLowerCase()
    return !foreign.some((other) => text.includes(norm(other)))
  })
}
