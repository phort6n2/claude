// ============================================
// DIRECTORY — LISTING VERIFICATION (anti-spam)
// ============================================
// The strongest single spam signal for this niche is the business's Google
// Business Profile CATEGORY: a real shop is categorized "Auto glass shop" or
// "Windshield repair service"; a fake/spam entry usually isn't. We classify the
// category from the Places API and use it to auto-approve real shops and flag
// everything else for review.
//
// classifyCategory() is a pure function used two ways:
//   • Audit existing listings — reads categories already in the reviews
//     snapshot (no extra API cost).
//   • Gate a NEW submission — verifyListingLive() does one live Places lookup.

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

function apiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
}

export function verifyEnabled(): boolean {
  return !!apiKey()
}

// Explicit glass/windshield categories → the shop we want.
const GLASS_WORDS = ['glass', 'windshield', 'windscreen']
// Broader automotive signals → real car business, but not explicitly glass.
const AUTOMOTIVE_WORDS = [
  'auto',
  'car ',
  'vehicle',
  'automotive',
  'tint',
  'collision',
  'tire',
  'mechanic',
  'body shop',
  'repair',
]
const AUTOMOTIVE_TYPES = new Set(['car_repair', 'auto_parts_store', 'car_dealer', 'car_wash'])

export type CategoryVerdict = 'auto_glass' | 'automotive' | 'off_category' | 'no_data'

export interface CategoryCheck {
  verdict: CategoryVerdict
  /** True only when it's clearly an auto-glass business (safe to auto-approve). */
  ok: boolean
  category: string
  reason: string
}

export function classifyCategory(category?: string, types?: string[]): CategoryCheck {
  const cat = (category || '').toLowerCase()
  const t = (types || []).map((x) => x.toLowerCase())
  const hay = [cat, ...t].join(' ')

  if (!category && !t.length) {
    return { verdict: 'no_data', ok: false, category: '', reason: 'No Google category on file' }
  }
  if (GLASS_WORDS.some((k) => hay.includes(k))) {
    return {
      verdict: 'auto_glass',
      ok: true,
      category: category || '',
      reason: 'Auto glass / windshield category',
    }
  }
  if (t.some((x) => AUTOMOTIVE_TYPES.has(x)) || AUTOMOTIVE_WORDS.some((k) => hay.includes(k))) {
    return {
      verdict: 'automotive',
      ok: false,
      category: category || '',
      reason: 'Automotive but not explicitly auto glass — worth a look',
    }
  }
  return {
    verdict: 'off_category',
    ok: false,
    category: category || '',
    reason: 'Not an auto glass or automotive category — likely spam',
  }
}

export interface VerifyResult extends CategoryCheck {
  found: boolean
  matchedName?: string
}

/** Live GBP category check for a single (new) submission. One Places call. */
export async function verifyListingLive(q: {
  name: string
  city?: string
  state?: string
  address?: string
}): Promise<VerifyResult> {
  if (!apiKey()) {
    return { found: false, verdict: 'no_data', ok: false, category: '', reason: 'Places API key not configured' }
  }
  const query = [q.name, q.address, q.city, q.state].filter(Boolean).join(', ')
  try {
    const res = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey(),
        'X-Goog-FieldMask':
          'places.displayName,places.primaryType,places.primaryTypeDisplayName,places.types',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { found: false, verdict: 'no_data', ok: false, category: '', reason: `Lookup failed (${res.status})` }
    }
    const d = await res.json()
    const p = d.places?.[0]
    if (!p) {
      return {
        found: false,
        verdict: 'no_data',
        ok: false,
        category: '',
        reason: 'No matching Google Business Profile found',
      }
    }
    const category = p.primaryTypeDisplayName?.text ?? p.primaryType
    return { ...classifyCategory(category, p.types), found: true, matchedName: p.displayName?.text }
  } catch {
    return { found: false, verdict: 'no_data', ok: false, category: '', reason: 'Lookup error' }
  }
}
