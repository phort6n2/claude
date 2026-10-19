import { AD_PLATFORMS, adPlatformOf, type AdPlatform } from '@/lib/traffic-source'

/**
 * "Where they came from" — the month's enquiries split by the ad platform
 * that paid for them, for a shop advertising on more than Google.
 *
 * A LEAF MODULE, read by the digest build, the portal page and the email, so
 * the rows and the sentence under them are decided once. Two renderers with
 * their own copy of the caveat is how one of them ends up without it.
 *
 * A PARTITION OF THE TOTAL, the same rule as `byChannel`: every canonical
 * lead lands in exactly one row, so the rows sum to the enquiry count above
 * them. "Everything else" is not a leftover to hide — it is where the calls to
 * the main number go, and that number is Google's as much as anybody's.
 */

export interface PlatformCount {
  total: number
  phone: number
  form: number
  sms: number
}

export type PlatformKey = AdPlatform | 'rest'
export type ByPlatform = Record<PlatformKey, PlatformCount>

const LABELS: Record<PlatformKey, string> = {
  google: 'Google Ads',
  microsoft: 'Microsoft Ads',
  meta: 'Meta Ads',
  rest: 'Everything else',
}

const empty = (): PlatformCount => ({ total: 0, phone: 0, form: 0, sms: 0 })

export function countByPlatform(
  leads: Array<{ source: string; trafficSource?: string | null; trafficMedium?: string | null }>
): ByPlatform {
  const out: ByPlatform = { google: empty(), microsoft: empty(), meta: empty(), rest: empty() }
  for (const lead of leads) {
    const row = out[adPlatformOf(lead) ?? 'rest']
    row.total++
    if (lead.source === 'PHONE') row.phone++
    else if (lead.source === 'FORM') row.form++
    else if (lead.source === 'SMS') row.sms++
  }
  return out
}

export interface PlatformRow extends PlatformCount {
  key: PlatformKey
  label: string
}

/**
 * The rows to render — EMPTY unless a non-Google platform produced something.
 *
 * Silent for a Google-only shop, on purpose: there the table would read
 * "Google Ads 4, everything else 22", and most of those 22 are calls from
 * Google's ads to the main number, which nothing on a call can prove. A table
 * that makes Google look like a sixth of the work is worse than no table. The
 * Google Ads section's own conversion count is the right figure for that
 * shop, and it is already on the page.
 *
 * `undefined` for a report built before this existed.
 */
export function platformRows(byPlatform: ByPlatform | undefined): PlatformRow[] {
  if (!byPlatform) return []
  if (byPlatform.microsoft.total + byPlatform.meta.total === 0) return []
  const keys: PlatformKey[] = [...AD_PLATFORMS.filter((k) => byPlatform[k].total > 0), 'rest']
  return keys.map((key) => ({ key, label: LABELS[key], ...byPlatform[key] }))
}

/**
 * Said under the table, in the page and the email alike. It claims nothing
 * about which numbers this shop has: a Meta row can be forms alone, and a
 * sentence saying "Meta has its own number" would be false for that shop.
 */
export const PLATFORM_NOTE =
  'A call counts for Microsoft or Meta only when it reaches the phone number shown to people those ads sent. Calls to your main number are under “Everything else”: that is the number Google Ads visitors, search and returning customers all see, so a call to it cannot say which one it was. Google’s own count of what its ads produced is in the Google Ads section.'
