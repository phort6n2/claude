/**
 * Calls our app recorded, set against the calls Google says it saw.
 *
 * WHY THIS EXISTS. When the shops moved onto the app's pages, the calls
 * Google CREDITED to the website ("AGMP Website Call") fell to a fraction of
 * what HighLevel's "AGMP Call" used to report — ElitePro logged 1 where the
 * old rate predicted about 16 — while forms per click did not move at all.
 * That is either people calling less from the new page, which is a design
 * problem, or Google counting fewer of the calls that happen, which is a
 * measurement problem, and the two need opposite fixes. Nothing in Google
 * Ads can tell them apart, because Google only knows the calls it saw. Our
 * Twilio numbers see every call that rings the shop, so the comparison has
 * to be made here, call by call.
 *
 * HOW A CALL IS MATCHED. Google's call log (`call_view`) is the calls placed
 * from an AD — the call button on the ad itself. Each row has a start time in
 * the ACCOUNT's timezone and the caller's area code. When the ad's call asset
 * forwards to one of our tracking numbers, the same call reaches Twilio a
 * second or two later and becomes a PHONE lead. So: same area code (or one
 * side unknown), start times within `MATCH_TOLERANCE_MS`, nearest first, each
 * call used once. What is left over says something:
 *   - our call with no Google twin → it did NOT come from an ad's call button:
 *     the website, the Business Profile, a repeat customer dialling direct;
 *   - a Google call with no twin of ours → a call the ads paid for that never
 *     reached a tracking number, which is fine only if the call asset points
 *     at the shop's own line (`callAssets` says which), and otherwise lost.
 *
 * Pure: rows in, summary out, so the rule is checked against Google's real
 * row shapes (`scripts/check-call-check.ts`) without credentials.
 */

/** A start-time gap within which two records are one call. */
export const MATCH_TOLERANCE_MS = 2 * 60 * 1000

export interface AppCall {
  id: string
  at: Date
  /** E.164 as Twilio sent it; withheld callers arrive as words or junk. */
  phone: string | null
  status: string | null
  durationSecs: number | null
  /** True when Twilio recorded it; false for a phone lead from anywhere else. */
  tracked: boolean
}

export interface GoogleCall {
  at: Date
  areaCode: string | null
  status: string | null
  durationSecs: number | null
}

/** The three-digit area code of a North American number, or null. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  if (digits.length === 10) return digits.slice(0, 3)
  return null
}

/**
 * `call_view.start_call_date_time` ("2026-10-06 16:39:42", in the ACCOUNT's
 * timezone, no offset on the string) as a UTC instant.
 *
 * Two passes for the offset, for the reason `zonedTimeToUtc` in lib/tz.ts
 * records: the offset has to be read at the instant being found, and a single
 * read lands an hour out on the day the clocks change.
 */
export function googleCallInstant(local: string, timezone: string): Date | null {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  const offset = (at: number) => {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' }).format(new Date(at))
    const o = s.match(/GMT([+-]\d+)(?::(\d{2}))?/)
    if (!o) return 0
    const h = parseInt(o[1], 10)
    const mins = o[2] ? parseInt(o[2], 10) * Math.sign(h || 1) : 0
    return h * 60 + mins
  }
  const first = offset(naive)
  const candidate = naive - first * 60_000
  const settled = offset(candidate)
  return new Date(settled === first ? candidate : naive - settled * 60_000)
}

export interface MatchResult {
  pairs: Array<{ app: AppCall; google: GoogleCall; gapSecs: number }>
  appOnly: AppCall[]
  googleOnly: GoogleCall[]
}

/**
 * One-to-one, nearest first. Greedy over every candidate pair sorted by gap,
 * so a call cannot steal a closer partner's twin just by coming earlier in the
 * list. Area codes must agree when BOTH are known; Google leaves the area code
 * off a withheld caller, and Twilio's "anonymous" yields none.
 */
export function matchCalls(app: AppCall[], google: GoogleCall[], toleranceMs = MATCH_TOLERANCE_MS): MatchResult {
  const candidates: Array<{ a: number; g: number; gap: number }> = []
  app.forEach((call, a) => {
    const ac = areaCodeOf(call.phone)
    google.forEach((gc, g) => {
      const gap = Math.abs(call.at.getTime() - gc.at.getTime())
      if (gap > toleranceMs) return
      if (ac && gc.areaCode && ac !== gc.areaCode) return
      candidates.push({ a, g, gap })
    })
  })
  candidates.sort((x, y) => x.gap - y.gap)
  const usedA = new Set<number>()
  const usedG = new Set<number>()
  const pairs: MatchResult['pairs'] = []
  for (const c of candidates) {
    if (usedA.has(c.a) || usedG.has(c.g)) continue
    usedA.add(c.a)
    usedG.add(c.g)
    pairs.push({ app: app[c.a], google: google[c.g], gapSecs: Math.round(c.gap / 1000) })
  }
  return {
    pairs,
    appOnly: app.filter((_, i) => !usedA.has(i)),
    googleOnly: google.filter((_, i) => !usedG.has(i)),
  }
}

/** Monday of the week containing `at`, in `timezone`, as YYYY-MM-DD. */
export function weekOf(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
  const d = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day') - Math.max(0, back)))
  return d.toISOString().slice(0, 10)
}

/**
 * The conversion actions worth a column, by NAME. `AGMP Call` / `AGMP Form`
 * are HighLevel's (the old pages); the other three are this app's standard
 * (docs/GOOGLE-ADS-SETUP.md). Anything else lands in `other` with its name
 * kept, because an unfamiliar action is exactly what somebody needs to see.
 */
export const CONVERSION_COLUMNS = {
  websiteCall: 'AGMP Website Call',
  callFromAds: 'AGMP Call From Ads',
  leadForm: 'AGMP Lead Form',
  legacyCall: 'AGMP Call',
  legacyForm: 'AGMP Form',
} as const
export type ConversionColumn = keyof typeof CONVERSION_COLUMNS

export function conversionColumnOf(actionName: string): ConversionColumn | null {
  const n = actionName.trim().toLowerCase()
  for (const [key, label] of Object.entries(CONVERSION_COLUMNS)) {
    if (n === label.toLowerCase()) return key as ConversionColumn
  }
  return null
}

export interface WeekRow {
  week: string
  /** Every PHONE lead our app wrote that week (Twilio-tracked or not). */
  appCalls: number
  appAnswered: number
  /** Our calls that Google also logged — they came from an ad's call button. */
  fromAdButton: number
  /** Our calls Google did not log — website, Business Profile, direct. */
  notFromAdButton: number
  /** Google's ad calls that never reached a tracking number. */
  googleOnly: number
  googleAdCalls: number
  conversions: Record<ConversionColumn, number> & { other: number }
}

export interface ConversionRow {
  week: string
  action: string
  allConversions: number
}

/** Fold everything into one row per week, newest first. */
export function weeklyRows(
  match: MatchResult,
  conversions: ConversionRow[],
  timezone: string
): WeekRow[] {
  const rows = new Map<string, WeekRow>()
  const row = (week: string) => {
    let r = rows.get(week)
    if (!r) {
      r = {
        week,
        appCalls: 0,
        appAnswered: 0,
        fromAdButton: 0,
        notFromAdButton: 0,
        googleOnly: 0,
        googleAdCalls: 0,
        conversions: { websiteCall: 0, callFromAds: 0, leadForm: 0, legacyCall: 0, legacyForm: 0, other: 0 },
      }
      rows.set(week, r)
    }
    return r
  }
  const answered = (c: AppCall) => c.status === 'completed' || (c.status == null && (c.durationSecs || 0) > 0)
  for (const p of match.pairs) {
    const r = row(weekOf(p.app.at, timezone))
    r.appCalls++
    r.fromAdButton++
    r.googleAdCalls++
    if (answered(p.app)) r.appAnswered++
  }
  for (const c of match.appOnly) {
    const r = row(weekOf(c.at, timezone))
    r.appCalls++
    r.notFromAdButton++
    if (answered(c)) r.appAnswered++
  }
  for (const g of match.googleOnly) {
    const r = row(weekOf(g.at, timezone))
    r.googleOnly++
    r.googleAdCalls++
  }
  for (const c of conversions) {
    // segments.week is already the Monday, in the account's timezone.
    const r = row(c.week)
    const col = conversionColumnOf(c.action)
    if (col) r.conversions[col] += c.allConversions
    else r.conversions.other += c.allConversions
  }
  return [...rows.values()].sort((a, b) => (a.week < b.week ? 1 : -1))
}

export interface CallCheckVerdict {
  tone: 'ok' | 'warn' | 'bad' | 'info'
  text: string
}

/**
 * The sentences at the top of a shop's row. Only claims the numbers carry:
 * each one names its counts, and none fires on a handful of calls.
 */
export function callCheckVerdicts(input: {
  weeks: WeekRow[]
  /** Call-asset numbers on the account, each with whether it is ours. */
  callAssets: Array<{ phone: string; ours: boolean }>
  googleLogStarts: string | null
}): CallCheckVerdict[] {
  const t = input.weeks.reduce(
    (s, w) => ({
      app: s.app + w.appCalls,
      notAd: s.notAd + w.notFromAdButton,
      googleOnly: s.googleOnly + w.googleOnly,
      googleAd: s.googleAd + w.googleAdCalls,
      website: s.website + w.conversions.websiteCall,
    }),
    { app: 0, notAd: 0, googleOnly: 0, googleAd: 0, website: 0 }
  )
  const out: CallCheckVerdict[] = []
  if (!t.app && !t.googleAd) {
    out.push({ tone: 'info', text: 'No calls in this window on either side.' })
    return out
  }
  if (t.notAd >= 5) {
    const share = t.website / t.notAd
    out.push({
      tone: share < 0.25 ? 'bad' : share < 0.6 ? 'warn' : 'ok',
      text:
        `${t.notAd} calls reached our numbers without coming from an ad's call button; Google credited ` +
        `${round1(t.website)} to the website. ` +
        (share < 0.25
          ? 'Google is seeing very few of the calls the pages produce — check its number swap reaches every call button.'
          : share < 0.6
            ? 'Google sees some but not most — part of this gap is direct and Business Profile calls, which it never sees.'
            : 'Google is seeing most of them.'),
    })
  }
  const anyOurs = input.callAssets.some((a) => a.ours)
  if (t.googleOnly >= 3) {
    out.push(
      anyOurs
        ? {
            tone: 'bad',
            text: `${t.googleOnly} calls Google logged from the ads never reached a tracking number. If the call asset points at a tracking number, those calls were lost or went elsewhere.`,
          }
        : {
            tone: 'info',
            text: `${t.googleOnly} ad calls went straight to the shop's own line — the ads' call asset is not one of our tracking numbers, so we cannot record or score them.`,
          }
    )
  }
  if (input.googleLogStarts) {
    out.push({
      tone: 'info',
      text: `Google's call log for this account starts ${input.googleLogStarts}; before that, only Google's weekly conversion counts are available.`,
    })
  }
  return out
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10)
}
