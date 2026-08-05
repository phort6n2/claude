/**
 * Work out whether a lead came from paid ads or somewhere else.
 *
 * Everything here is derived from data already captured on the Lead — click
 * identifiers, UTM tags, and the referrer the landing page passed through. No
 * ad-platform API is involved.
 *
 * Honest limits, so the badges aren't trusted further than they deserve:
 *  - Phone calls routed through Google's call-tracking pool arrive with no
 *    click id, so a call is usually `unknown` unless it can inherit attribution
 *    from a same-day form submission by the same person.
 *  - `fbclid` is appended by Facebook to organic post links as well as ads, so
 *    on its own it means "came from Facebook", not "came from a paid ad".
 */

export type LeadChannel = 'paid' | 'organic' | 'referral' | 'direct' | 'social' | 'unknown'

export interface LeadChannelResult {
  channel: LeadChannel
  /** Ad platform / traffic source when we can name it, e.g. "Google Ads". */
  source: string | null
  /** Why we decided — shown on hover so the badge is auditable. */
  reason: string
}

/** Click identifiers that ONLY ever come from a paid ad click. */
const PAID_CLICK_IDS: Array<{ key: string; label: string }> = [
  { key: 'gclid', label: 'Google Ads' },
  { key: 'gbraid', label: 'Google Ads' },
  { key: 'wbraid', label: 'Google Ads' },
  { key: 'msclkid', label: 'Microsoft Ads' },
  { key: 'ttclid', label: 'TikTok Ads' },
]

/** utm_medium values that mean paid traffic. */
const PAID_MEDIUMS = new Set([
  'cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'paid-search',
  'paidsocial', 'paid_social', 'paid-social', 'display', 'banner',
  'retargeting', 'remarketing', 'cpm', 'cpv',
])

const ORGANIC_MEDIUMS = new Set(['organic', 'seo', 'natural'])
const SOCIAL_MEDIUMS = new Set(['social', 'social-network', 'social_network'])

const SEARCH_ENGINE_HOSTS = [
  'google.', 'bing.', 'duckduckgo.', 'yahoo.', 'ecosia.', 'search.brave.',
  'baidu.', 'yandex.',
]

const SOCIAL_HOSTS = [
  'facebook.', 'instagram.', 'tiktok.', 'linkedin.', 'twitter.', 'x.com',
  'reddit.', 'youtube.', 'pinterest.',
]

/** The subset of Lead fields this needs — keeps it usable from any view. */
export interface LeadAttribution {
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  referrerUrl?: string | null
  formData?: Record<string, unknown> | null
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** formData holds the click ids that have no dedicated Lead column. */
function fromFormData(formData: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!formData) return null
  const direct = clean(formData[key])
  if (direct) return direct
  const raw = formData._rawPayload
  if (raw && typeof raw === 'object') {
    return clean((raw as Record<string, unknown>)[key])
  }
  return null
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function getLeadChannel(lead: LeadAttribution): LeadChannelResult {
  const medium = clean(lead.utmMedium)?.toLowerCase() ?? null
  const utmSource = clean(lead.utmSource)
  const campaign = clean(lead.utmCampaign)

  // 1. A paid click id is the strongest signal there is.
  for (const { key, label } of PAID_CLICK_IDS) {
    const value =
      clean((lead as Record<string, unknown>)[key]) ?? fromFormData(lead.formData, key)
    if (value) {
      return {
        channel: 'paid',
        source: label,
        reason: `${key} present${campaign ? ` · ${campaign}` : ''}`,
      }
    }
  }

  // 2. UTM tagging that explicitly says paid.
  if (medium && PAID_MEDIUMS.has(medium)) {
    return {
      channel: 'paid',
      source: utmSource ? titleCase(utmSource) : null,
      reason: `utm_medium=${medium}${campaign ? ` · ${campaign}` : ''}`,
    }
  }

  if (medium && ORGANIC_MEDIUMS.has(medium)) {
    return { channel: 'organic', source: utmSource ? titleCase(utmSource) : null, reason: `utm_medium=${medium}` }
  }

  if (medium && SOCIAL_MEDIUMS.has(medium)) {
    return { channel: 'social', source: utmSource ? titleCase(utmSource) : null, reason: `utm_medium=${medium}` }
  }

  // 3. Facebook stamps fbclid on organic links too, so it only tells us the
  //    visitor came from Facebook — not that an ad was paid for.
  const fbclid = fromFormData(lead.formData, 'fbclid')
  if (fbclid) {
    return { channel: 'social', source: 'Facebook', reason: 'fbclid present (organic or paid)' }
  }

  // 4. Fall back to the referrer.
  const host = hostOf(clean(lead.referrerUrl))
  if (host) {
    if (SEARCH_ENGINE_HOSTS.some((h) => host.includes(h))) {
      return { channel: 'organic', source: prettyHost(host), reason: `referred by ${host}` }
    }
    if (SOCIAL_HOSTS.some((h) => host.includes(h))) {
      return { channel: 'social', source: prettyHost(host), reason: `referred by ${host}` }
    }
    return { channel: 'referral', source: prettyHost(host), reason: `referred by ${host}` }
  }

  // 5. Tagged with something we don't recognise, but tagged nonetheless.
  if (utmSource || medium) {
    return {
      channel: 'referral',
      source: utmSource ? titleCase(utmSource) : null,
      reason: `utm_source=${utmSource ?? '—'} / utm_medium=${medium ?? '—'}`,
    }
  }

  return { channel: 'unknown', source: null, reason: 'No attribution data captured' }
}

/**
 * Channel for a lead, falling back to any same-day duplicate contact that does
 * carry attribution. A caller who filled the form earlier that day is the same
 * person, so the form's attribution applies to the call too.
 */
export function getLeadChannelWithDuplicates(
  lead: LeadAttribution & { duplicates?: LeadAttribution[] | null }
): LeadChannelResult {
  const own = getLeadChannel(lead)
  if (own.channel !== 'unknown') return own

  for (const dup of lead.duplicates ?? []) {
    const result = getLeadChannel(dup)
    if (result.channel !== 'unknown') {
      return { ...result, reason: `${result.reason} (from same-day form submission)` }
    }
  }
  return own
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function prettyHost(host: string): string {
  const bare = host.replace(/^www\./, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}

export const CHANNEL_META: Record<
  LeadChannel,
  { label: string; text: string; bg: string; description: string }
> = {
  paid: { label: 'Ads', text: 'text-emerald-700', bg: 'bg-emerald-100', description: 'Came from a paid ad click' },
  organic: { label: 'Organic', text: 'text-blue-700', bg: 'bg-blue-100', description: 'Came from unpaid search' },
  social: { label: 'Social', text: 'text-purple-700', bg: 'bg-purple-100', description: 'Came from social media' },
  referral: { label: 'Referral', text: 'text-indigo-700', bg: 'bg-indigo-100', description: 'Came from another website' },
  direct: { label: 'Direct', text: 'text-gray-600', bg: 'bg-gray-100', description: 'Typed the site in directly' },
  unknown: { label: 'Unknown', text: 'text-gray-500', bg: 'bg-gray-100', description: 'No attribution data captured' },
}
