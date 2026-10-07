import { prisma } from '@/lib/db'
import { adsSearch } from '@/lib/google-ads'
import {
  matchCalls,
  weeklyRows,
  callCheckVerdicts,
  googleCallInstant,
  areaCodeOf,
  type AppCall,
  type GoogleCall,
  type ConversionRow,
} from '@/lib/call-check'

/**
 * One shop's calls: ours against Google's, week by week — the database and
 * Google halves of the Call check, kept out of the route so the admin page and
 * the scheduled run (`/api/cron/call-check`) cannot drift into two answers.
 * See lib/call-check.ts for what the comparison means. READ-ONLY on both
 * sides: database reads and GAQL selects, nothing written anywhere.
 *
 * Google's call log does not go back as far as its conversion counts, so a
 * long window shows calls for the recent part and conversions for all of it,
 * and the result says where the call log starts rather than letting the empty
 * weeks read as no calls.
 */
export async function runCallCheck(clientId: string, days: number) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      timezone: true,
      phone: true,
      siteDisplayPhone: true,
      adsTracking: { select: { googleAdsCustomerId: true } },
      trackingNumbers: { select: { phoneNumber: true, forwardTo: true } },
    },
  })
  if (!client) return null

  const since = new Date(Date.now() - days * 86_400_000)
  const sinceDay = since.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const leads = await prisma.lead.findMany({
    // TWILIO-TRACKED calls only. A PHONE lead without a CallSid is one HighLevel
    // delivered from ITS numbers — never ours to match — and counting them
    // read, on HV, ElitePro and Collision, as hundreds of calls "not from an ad
    // button" that Google had supposedly missed (each with 0 answered, because
    // HighLevel never told us the outcome).
    where: { clientId, source: 'PHONE', createdAt: { gte: since }, twilioCallSid: { not: null } },
    select: { id: true, createdAt: true, phone: true, callStatus: true, callDurationSecs: true, twilioCallSid: true },
    orderBy: { createdAt: 'asc' },
  })
  const appCalls: AppCall[] = leads.map((l) => ({
    id: l.id,
    at: l.createdAt,
    phone: l.phone,
    status: l.callStatus,
    durationSecs: l.callDurationSecs,
    tracked: !!l.twilioCallSid,
  }))

  const customerId = client.adsTracking?.googleAdsCustomerId?.replace(/\D/g, '') || null
  const ourNumbers = new Set(
    client.trackingNumbers.map((t) => t.phoneNumber.replace(/\D/g, '').slice(-10))
  )

  let googleError: string | null = null
  let googleCalls: GoogleCall[] = []
  let conversions: ConversionRow[] = []
  let callAssets: Array<{ phone: string; ours: boolean }> = []
  // The account's zone, not the shop's: call_view's times are written in it.
  let accountZone = client.timezone

  if (customerId) {
    const [tz, calls, conv, assets] = await Promise.all([
      adsSearch(customerId, 'SELECT customer.time_zone FROM customer LIMIT 1'),
      adsSearch(
        customerId,
        `SELECT call_view.start_call_date_time, call_view.call_duration_seconds, call_view.call_status, call_view.caller_area_code FROM call_view WHERE call_view.start_call_date_time >= '${sinceDay} 00:00:00'`
      ),
      adsSearch(
        customerId,
        // Google refuses an open-ended range here (EXPECTED_FILTERS_ON_DATE_RANGE).
        `SELECT segments.week, segments.conversion_action_name, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${sinceDay}' AND '${today}' AND metrics.all_conversions > 0`
      ),
      liveCallAssets(customerId),
    ])
    if (tz.ok) {
      const zone = (tz.rows[0] as { customer?: { timeZone?: string } })?.customer?.timeZone
      if (zone) accountZone = zone
    }
    if (calls.ok) {
      googleCalls = calls.rows
        .map((r) => (r as { callView?: Record<string, string> }).callView || {})
        .map((cv) => ({
          at: googleCallInstant(cv.startCallDateTime, accountZone),
          areaCode: cv.callerAreaCode || null,
          status: cv.callStatus || null,
          durationSecs: cv.callDurationSeconds != null ? Number(cv.callDurationSeconds) : null,
        }))
        .filter((c): c is GoogleCall => !!c.at)
    } else googleError = `Call log: ${calls.error}`
    if (conv.ok) {
      conversions = conv.rows
        .map((r) => {
          const row = r as { segments?: { week?: string; conversionActionName?: string }; metrics?: { allConversions?: number | string } }
          return {
            week: row.segments?.week || '',
            action: row.segments?.conversionActionName || '(unnamed)',
            allConversions: Number(row.metrics?.allConversions || 0),
          }
        })
        .filter((c) => c.week && c.allConversions > 0)
    } else googleError = [googleError, `Conversions: ${conv.error}`].filter(Boolean).join(' · ')
    if (assets.ok) {
      const seen = new Set<string>()
      for (const r of assets.rows) {
        const phone = (r as { asset?: { callAsset?: { phoneNumber?: string } } }).asset?.callAsset?.phoneNumber
        if (!phone) continue
        const key = phone.replace(/\D/g, '').slice(-10)
        if (seen.has(key)) continue
        seen.add(key)
        callAssets.push({ phone, ours: ourNumbers.has(key) })
      }
    }
  }

  const match = matchCalls(appCalls, googleCalls)
  // How each of our calls ended, as Twilio reported it — the difference between
  // a shop that misses calls (no-answer, busy) and a forward that never
  // connects (failed), which need opposite fixes.
  const callOutcomes: Record<string, number> = {}
  for (const c of appCalls) {
    const k = c.status || 'unknown'
    callOutcomes[k] = (callOutcomes[k] || 0) + 1
  }
  // Every action by name, week by week — the page folds unfamiliar ones into
  // "other", but the old weeks are full of them ("Phone call click", "Calls
  // from ads") and reading the past means seeing which one counted what.
  const byAction: Record<string, Record<string, number>> = {}
  for (const c of conversions) {
    const w = (byAction[c.week] ||= {})
    w[c.action] = Math.round(((w[c.action] || 0) + c.allConversions) * 10) / 10
  }
  const weeks = weeklyRows(match, conversions, accountZone).filter((w) => w.week >= weekFloor(sinceDay))

  // Where Google's log effectively begins, so empty early weeks are not read
  // as "no ad calls". Only worth saying when it is well inside the window.
  const firstGoogle = googleCalls.reduce<Date | null>((m, c) => (!m || c.at < m ? c.at : m), null)
  const googleLogStarts =
    firstGoogle && firstGoogle.getTime() - since.getTime() > 14 * 86_400_000
      ? firstGoogle.toISOString().slice(0, 10)
      : null

  const recent = <T extends { at: Date }>(list: T[]) =>
    [...list].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40)

  return {
    client: { id: client.id, businessName: client.businessName },
    days,
    since: sinceDay,
    timezone: accountZone,
    adsAccount: customerId,
    googleError,
    callAssets,
    weeks,
    verdicts: callCheckVerdicts({ weeks, callAssets, googleLogStarts }),
    byAction,
    googleLogStarts,
    callOutcomes,
    // The leftovers, newest first, so a surprising count can be looked at.
    notFromAdButton: recent(match.appOnly).map((c) => ({
      at: c.at.toISOString(),
      areaCode: areaCodeOf(c.phone),
      status: c.status,
      durationSecs: c.durationSecs,
      leadId: c.id,
    })),
    googleOnly: recent(match.googleOnly).map((c) => ({
      at: c.at.toISOString(),
      areaCode: c.areaCode,
      status: c.status,
      durationSecs: c.durationSecs,
    })),
  }
}

/**
 * The call numbers the ads can ACTUALLY ring: call assets linked and enabled
 * at account level, or on an enabled campaign or ad group. Listing every CALL
 * asset in the account read AGK as "6 of 7 not ours" when five of those were
 * paused leftovers and the one live link was its tracking number — a finding
 * about numbers nobody can reach.
 */
async function liveCallAssets(
  customerId: string
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }> {
  const results = await Promise.all([
    adsSearch(customerId, `SELECT asset.call_asset.phone_number FROM customer_asset WHERE customer_asset.field_type = 'CALL' AND customer_asset.status = 'ENABLED'`),
    adsSearch(customerId, `SELECT asset.call_asset.phone_number FROM campaign_asset WHERE campaign_asset.field_type = 'CALL' AND campaign_asset.status = 'ENABLED' AND campaign.status = 'ENABLED'`),
    adsSearch(customerId, `SELECT asset.call_asset.phone_number FROM ad_group_asset WHERE ad_group_asset.field_type = 'CALL' AND ad_group_asset.status = 'ENABLED' AND campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'`),
  ])
  const failed = results.find((r) => !r.ok)
  if (failed && !failed.ok) return failed
  return { ok: true, rows: results.flatMap((r) => (r.ok ? r.rows : [])) }
}

export type CallCheckResult = NonNullable<Awaited<ReturnType<typeof runCallCheck>>>

/** The Monday on or before a YYYY-MM-DD, so the first partial week is kept. */
function weekFloor(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}
