import { adsSearch } from '@/lib/google-ads'
import { googleCallInstant, matchCalls, type AppCall, type GoogleCall } from '@/lib/call-check'
import {
  MAX_CANDIDATES,
  UNTRACED_NOTE,
  costMatch,
  hourCampaigns,
  rankCandidates,
  reasonHits,
  type Candidate,
  type Confidence,
  type HourRow,
} from '@/lib/bad-lead'

/**
 * Trace one lead back to the Google Ads search that bought it. READ-ONLY:
 * GAQL selects, nothing written anywhere. Every date and hour is the ACCOUNT's
 * (`customer.time_zone`), because that is the zone every one of these
 * resources reports in.
 *
 * In order of strength:
 *   1. a form lead's gclid → `click_view` (needs a single-day filter, 90 days back);
 *   2. a call → `call_view`, same area code, start within 3 minutes;
 *   3. a call the log does not have → the AGMP campaign with ad calls left in
 *      that hour (PMax calls never reach `call_view`);
 *   4. the landing URL's campaign_id/ad_group_id.
 * The candidates are that ad group's (Search) or campaign's (PMax) searches
 * that day, because Google gives search terms per DAY only. When exactly one
 * click happened in the hour, its cost picks the term out ("best match").
 */

export const CALL_TOLERANCE_MS = 3 * 60 * 1000
/** What the model sees; the panel shows the first MAX_CANDIDATES. */
const MAX_FOR_MODEL = 40

type Search = typeof adsSearch
type Row = Record<string, unknown>

const obj = (v: unknown): Row => (v && typeof v === 'object' ? (v as Row) : {})
const s = (v: unknown): string => (v == null ? '' : String(v))
const num = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(x) ? x : 0
}
const digits = (v: unknown) => s(v).replace(/\D/g, '')
const isAgmp = (name: string) => name.startsWith('AGMP')

export interface TraceLead {
  id: string
  createdAt: Date
  source: string
  phone: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  trafficSource: string | null
  trafficMedium: string | null
  firstSeenAt: Date | null
  utmCampaign: string | null
  utmContent: string | null
  campaignId: string | null
  adGroupId: string | null
}

export interface TraceResult {
  confidence: Confidence
  accountZone: string
  /** YYYY-MM-DD in the account's zone: the day the searches are from. */
  date: string | null
  hour: number | null
  campaign: { id: string; name: string; channel: string } | null
  adGroup: { id: string; name: string } | null
  /** Google's record of the call, when one matched. */
  matchedCall: { startedAt: string; areaCode: string | null; durationSecs: number | null; gapSecs: number } | null
  /** The keyword the click matched, from click_view. */
  keyword: { text: string; matchType: string } | null
  /** Other campaigns with ad calls left in the same hour, when the hour was not decisive. */
  alsoPossible: Array<{ id: string; name: string }>
  /** The lead was traced to a campaign that is not ours — nothing is touched. */
  notOurs: boolean
  note: string
  candidates: Candidate[]
  /** Everything found that day, for the model. */
  allCandidates: Candidate[]
  errors: string[]
}

/** YYYY-MM-DD and the hour of `at` in `zone`. */
export function localParts(at: Date, zone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value
      return acc
    }, {})
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour, 10) % 24 }
}

function addDay(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function empty(zone: string, note: string, errors: string[] = []): TraceResult {
  return {
    confidence: 'none',
    accountZone: zone,
    date: null,
    hour: null,
    campaign: null,
    adGroup: null,
    matchedCall: null,
    keyword: null,
    alsoPossible: [],
    notOurs: false,
    note,
    candidates: [],
    allCandidates: [],
    errors,
  }
}

/** The day's searches for an ad group (Search) or a campaign (PMax). */
async function searchTerms(
  search: Search,
  customerId: string,
  date: string,
  campaign: { id: string; name: string; channel: string },
  adGroup: { id: string; name: string } | null,
  reason: string
): Promise<{ ok: true; list: Candidate[] } | { ok: false; error: string }> {
  const pmax = campaign.channel === 'PERFORMANCE_MAX'
  const res = pmax
    ? await search(
        customerId,
        `SELECT campaign_search_term_view.search_term, metrics.clicks, metrics.cost_micros
         FROM campaign_search_term_view
         WHERE segments.date = '${date}' AND campaign.id = ${digits(campaign.id)} AND metrics.clicks > 0`
      )
    : await search(
        customerId,
        `SELECT search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type,
                ad_group.id, ad_group.name, metrics.clicks, metrics.cost_micros
         FROM search_term_view
         WHERE segments.date = '${date}' AND ${adGroup ? `ad_group.id = ${digits(adGroup.id)}` : `campaign.id = ${digits(campaign.id)}`}
           AND metrics.clicks > 0`
      )
  if (!res.ok) return res
  // One term can arrive once per keyword it matched; the panel shows the term.
  const byTerm = new Map<string, Candidate>()
  for (const r of res.rows) {
    const row = obj(r)
    const term = s(obj(pmax ? row.campaignSearchTermView : row.searchTermView).searchTerm)
    if (!term) continue
    const m = obj(row.metrics)
    const kw = obj(obj(obj(row.segments).keyword).info)
    const ag = obj(row.adGroup)
    const prev = byTerm.get(term)
    if (prev) {
      prev.clicks += num(m.clicks)
      prev.costMicros += num(m.costMicros)
      continue
    }
    byTerm.set(term, {
      term,
      clicks: num(m.clicks),
      costMicros: num(m.costMicros),
      campaignId: campaign.id,
      campaignName: campaign.name,
      adGroupId: pmax ? null : s(ag.id) || adGroup?.id || null,
      adGroupName: pmax ? null : s(ag.name) || adGroup?.name || null,
      keyword: s(kw.text) || null,
      keywordMatchType: s(kw.matchType) || null,
      bestMatch: false,
      reasonHits: reasonHits(term, reason),
    })
  }
  return { ok: true, list: [...byTerm.values()] }
}

/** Clicks and cost in one hour for the ad group (Search) or campaign (PMax). */
async function hourSpend(
  search: Search,
  customerId: string,
  date: string,
  campaign: { id: string; channel: string },
  adGroup: { id: string } | null,
  hours: number[]
): Promise<Map<number, { clicks: number; costMicros: number }>> {
  const out = new Map<number, { clicks: number; costMicros: number }>()
  const useAdGroup = adGroup && campaign.channel !== 'PERFORMANCE_MAX'
  const res = await search(
    customerId,
    useAdGroup
      ? `SELECT segments.hour, metrics.clicks, metrics.cost_micros FROM ad_group
         WHERE segments.date = '${date}' AND ad_group.id = ${digits(adGroup!.id)}`
      : `SELECT segments.hour, metrics.clicks, metrics.cost_micros FROM campaign
         WHERE segments.date = '${date}' AND campaign.id = ${digits(campaign.id)}`
  )
  if (!res.ok) return out
  for (const r of res.rows) {
    const row = obj(r)
    const h = num(obj(row.segments).hour)
    if (!hours.includes(h)) continue
    const m = obj(row.metrics)
    const prev = out.get(h) || { clicks: 0, costMicros: 0 }
    out.set(h, { clicks: prev.clicks + num(m.clicks), costMicros: prev.costMicros + num(m.costMicros) })
  }
  return out
}

/**
 * `sameDayCalls`: every PHONE lead the client had that day, this one included,
 * so a call is matched one-to-one against Google's log — two calls a minute
 * apart cannot both claim the same record.
 */
export async function traceLead(input: {
  lead: TraceLead
  customerId: string
  fallbackZone: string
  reason: string
  sameDayCalls?: AppCall[]
  search?: Search
}): Promise<TraceResult> {
  const search = input.search || adsSearch
  const { lead, reason } = input
  const customerId = digits(input.customerId)
  const errors: string[] = []

  const tz = await search(customerId, 'SELECT customer.time_zone FROM customer LIMIT 1')
  const zone = (tz.ok && s(obj(obj(tz.rows[0]).customer).timeZone)) || input.fallbackZone
  if (!tz.ok) errors.push(`Account timezone: ${tz.error}`)

  const at = localParts(lead.createdAt, zone)
  let confidence: Confidence = 'none'
  let date = at.date
  let hours = [at.hour]
  let campaign: TraceResult['campaign'] = null
  let adGroup: TraceResult['adGroup'] = null
  let matchedCall: TraceResult['matchedCall'] = null
  let keyword: TraceResult['keyword'] = null
  let alsoPossible: TraceResult['alsoPossible'] = []
  let note = ''

  /* 1. The click id. click_view needs ONE day, and the click can be days
        before the lead (the attribution lasts 90 days), so the day the visitor
        first landed is tried as well as the lead's day and the day before. */
  if (lead.gclid) {
    const days = [at.date, addDay(at.date, -1)]
    if (lead.firstSeenAt) days.push(localParts(lead.firstSeenAt, zone).date)
    for (const d of [...new Set(days)]) {
      const res = await search(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name,
                click_view.keyword_info.text, click_view.keyword_info.match_type
         FROM click_view
         WHERE segments.date = '${d}' AND click_view.gclid = '${lead.gclid.replace(/[^A-Za-z0-9_-]/g, '')}'`
      )
      if (!res.ok) {
        errors.push(`Click lookup ${d}: ${res.error}`)
        continue
      }
      const row = obj(res.rows[0])
      const c = obj(row.campaign)
      if (!s(c.id)) continue
      campaign = { id: s(c.id), name: s(c.name), channel: s(c.advertisingChannelType) }
      const ag = obj(row.adGroup)
      adGroup = s(ag.id) ? { id: s(ag.id), name: s(ag.name) } : null
      const kw = obj(obj(row.clickView).keywordInfo)
      keyword = s(kw.text) ? { text: s(kw.text), matchType: s(kw.matchType) } : null
      date = d
      // The form is filled in after the click, so the click hour is this one or the one before.
      hours = d === at.date ? [at.hour, at.hour - 1].filter((h) => h >= 0) : []
      confidence = 'gclid'
      note = `Google’s click record for this lead’s gclid, ${d}.`
      break
    }
  }

  /* 2 + 3. A call: Google's call log, then the hour. */
  if (confidence === 'none' && lead.source === 'PHONE') {
    const res = await search(
      customerId,
      `SELECT call_view.start_call_date_time, call_view.call_duration_seconds, call_view.caller_area_code,
              campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name
       FROM call_view
       WHERE call_view.start_call_date_time >= '${at.date} 00:00:00' AND call_view.start_call_date_time <= '${at.date} 23:59:59'`
    )
    const logged: Array<{ google: GoogleCall; row: Row; hour: number }> = []
    if (res.ok) {
      for (const r of res.rows) {
        const row = obj(r)
        const cv = obj(row.callView)
        const when = googleCallInstant(s(cv.startCallDateTime), zone)
        if (!when) continue
        logged.push({
          google: {
            at: when,
            areaCode: s(cv.callerAreaCode) || null,
            status: null,
            durationSecs: cv.callDurationSeconds != null ? num(cv.callDurationSeconds) : null,
          },
          row,
          hour: parseInt(s(cv.startCallDateTime).slice(11, 13), 10),
        })
      }
    } else errors.push(`Call log: ${res.error}`)

    const mine: AppCall = { id: lead.id, at: lead.createdAt, phone: lead.phone, status: null, durationSecs: null, tracked: true }
    const others = (input.sameDayCalls || []).filter((c) => c.id !== lead.id)
    const matched = matchCalls([mine, ...others], logged.map((l) => l.google), CALL_TOLERANCE_MS).pairs.find((p) => p.app.id === lead.id)
    if (matched) {
      const hit = logged.find((l) => l.google === matched.google)!
      const c = obj(hit.row.campaign)
      const ag = obj(hit.row.adGroup)
      campaign = { id: s(c.id), name: s(c.name), channel: s(c.advertisingChannelType) }
      adGroup = s(ag.id) ? { id: s(ag.id), name: s(ag.name) } : null
      matchedCall = {
        startedAt: s(obj(hit.row.callView).startCallDateTime),
        areaCode: hit.google.areaCode,
        durationSecs: hit.google.durationSecs,
        gapSecs: matched.gapSecs,
      }
      hours = [hit.hour]
      confidence = 'call'
      note = `Google’s call log: ${matchedCall.startedAt}${matchedCall.areaCode ? `, area code ${matchedCall.areaCode}` : ''}, ${matched.gapSecs}s from our record.`
    } else if (res.ok) {
      // Not in the log: which AGMP campaign took ad calls that hour that the log does not account for.
      const hourly = await search(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, segments.hour, metrics.phone_calls
         FROM campaign
         WHERE segments.date = '${at.date}' AND campaign.name LIKE 'AGMP%' AND metrics.phone_calls > 0`
      )
      if (hourly.ok) {
        const rows: HourRow[] = hourly.rows.map((r) => {
          const row = obj(r)
          const c = obj(row.campaign)
          return {
            campaignId: s(c.id),
            campaignName: s(c.name),
            channel: s(c.advertisingChannelType),
            hour: num(obj(row.segments).hour),
            phoneCalls: num(obj(row.metrics).phoneCalls),
          }
        })
        // A call can straddle the hour; the minute decides which side.
        const near = [at.hour]
        const minute = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: zone, minute: '2-digit' }).format(lead.createdAt), 10)
        if (minute < 3 && at.hour > 0) near.push(at.hour - 1)
        const loggedCalls = logged.map((l) => ({ campaignId: s(obj(l.row.campaign).id), hour: l.hour }))
        let found: ReturnType<typeof hourCampaigns> = []
        for (const h of near) {
          found = hourCampaigns(rows, h, loggedCalls)
          if (found.length) {
            hours = [h]
            break
          }
        }
        if (found.length) {
          const top = found[0]
          campaign = { id: top.campaignId, name: top.campaignName, channel: top.channel }
          alsoPossible = found.slice(1).map((f) => ({ id: f.campaignId, name: f.campaignName }))
          confidence = 'hour'
          note = `Not in Google’s call log. ${top.campaignName} took ${top.residual} ad call${top.residual === 1 ? '' : 's'} in the ${hours[0]}:00 hour that the log does not account for${
            alsoPossible.length ? `; also possible: ${alsoPossible.map((a) => a.name).join(', ')}` : ''
          }.`
        }
      } else errors.push(`Hourly calls: ${hourly.error}`)
    }
  }

  /* 4. The landing URL named the campaign (and maybe the ad group). Collision's
        template puts the IDs in utm_campaign/utm_content as well as
        campaign_id/ad_group_id, so either is read. */
  if (confidence === 'none') {
    const cid = digits(lead.campaignId) || (/^\d{6,}$/.test(s(lead.utmCampaign)) ? s(lead.utmCampaign) : '')
    const agid = digits(lead.adGroupId) || (/^\d{6,}$/.test(s(lead.utmContent)) ? s(lead.utmContent) : '')
    if (cid) {
      const res = await search(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${cid}`
      )
      const c = res.ok ? obj(obj(res.rows[0]).campaign) : {}
      if (s(c.id)) {
        campaign = { id: s(c.id), name: s(c.name), channel: s(c.advertisingChannelType) }
        if (agid && campaign.channel !== 'PERFORMANCE_MAX') {
          const ag = await search(customerId, `SELECT ad_group.id, ad_group.name FROM ad_group WHERE ad_group.id = ${agid}`)
          const a = ag.ok ? obj(obj(ag.rows[0]).adGroup) : {}
          if (s(a.id)) adGroup = { id: s(a.id), name: s(a.name) }
        }
        hours = [at.hour, at.hour - 1].filter((h) => h >= 0)
        confidence = 'utm'
        note = 'The campaign was named in the landing page’s address.'
      } else if (!res.ok) errors.push(`Campaign lookup: ${res.error}`)
    }
  }

  if (confidence === 'none') {
    const paidGoogle = !!(lead.gclid || lead.gbraid || lead.wbraid) || (lead.trafficSource === 'google' && lead.trafficMedium === 'paid')
    if (!paidGoogle) return empty(zone, UNTRACED_NOTE, errors)
    // A Google ad click this lead cannot be placed in: the day's searches across AGMP, as suggestions only.
    const day = await dayCandidates(search, customerId, at.date, reason)
    if (!day.ok) return empty(zone, UNTRACED_NOTE, [...errors, day.error])
    const ranked = rankCandidates(day.list)
    return {
      ...empty(zone, `A Google ad click (${lead.gclid ? 'gclid not found in Google’s click records' : 'iPhone click id, which Google’s click records cannot look up'}), but not placed in a campaign. These are the day’s AGMP searches — suggestions only.`, errors),
      confidence: 'day',
      date: at.date,
      candidates: ranked.slice(0, MAX_CANDIDATES),
      allCandidates: ranked.slice(0, MAX_FOR_MODEL),
    }
  }

  const notOurs = !!campaign && !isAgmp(campaign.name)
  if (notOurs) {
    return {
      ...empty(zone, `Traced to "${campaign!.name}", which is not an AGMP campaign — nothing is changed there.`, errors),
      confidence,
      date,
      campaign,
      adGroup,
      matchedCall,
      keyword,
      notOurs: true,
    }
  }

  const terms = await searchTerms(search, customerId, date, campaign!, adGroup, reason)
  let list: Candidate[] = []
  if (terms.ok) list = terms.list
  else errors.push(`Search terms: ${terms.error}`)

  // Best match: the one click in the hour, by its cost.
  if (list.length && hours.length) {
    const spend = await hourSpend(search, customerId, date, campaign!, adGroup, hours)
    for (const h of hours) {
      const hs = spend.get(h)
      if (!hs) continue
      const term = costMatch(list, hs.clicks, hs.costMicros)
      if (term) {
        const c = list.find((x) => x.term === term)!
        c.bestMatch = true
        c.bestWhy = `The only click in the ${h}:00 hour cost $${(hs.costMicros / 1e6).toFixed(2)}, and so did this search.`
        break
      }
    }
  }
  // Or: the click's own keyword, when only one search came in on it that day.
  if (keyword && !list.some((c) => c.bestMatch)) {
    const onKw = list.filter((c) => c.keyword && c.keyword.toLowerCase() === keyword!.text.toLowerCase())
    if (onKw.length === 1) {
      onKw[0].bestMatch = true
      onKw[0].bestWhy = `The only search that day on the keyword the click matched ("${keyword.text}").`
    }
  }

  const ranked = rankCandidates(list)
  return {
    confidence,
    accountZone: zone,
    date,
    hour: hours[0] ?? null,
    campaign,
    adGroup,
    matchedCall,
    keyword,
    alsoPossible,
    notOurs: false,
    note: note + (list.length ? '' : ' Google reported no searches with clicks for it that day.'),
    candidates: ranked.slice(0, MAX_CANDIDATES),
    allCandidates: ranked.slice(0, MAX_FOR_MODEL),
    errors,
  }
}

async function dayCandidates(
  search: Search,
  customerId: string,
  date: string,
  reason: string
): Promise<{ ok: true; list: Candidate[] } | { ok: false; error: string }> {
  const [searchRes, pmaxCampaigns] = await Promise.all([
    search(
      customerId,
      `SELECT search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.clicks, metrics.cost_micros
       FROM search_term_view
       WHERE segments.date = '${date}' AND campaign.name LIKE 'AGMP%' AND metrics.clicks > 0`
    ),
    search(
      customerId,
      `SELECT campaign.id, campaign.name FROM campaign
       WHERE campaign.name LIKE 'AGMP%' AND campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND campaign.status = 'ENABLED'`
    ),
  ])
  if (!searchRes.ok) return searchRes
  const list: Candidate[] = []
  for (const r of searchRes.rows) {
    const row = obj(r)
    const c = obj(row.campaign)
    const ag = obj(row.adGroup)
    const m = obj(row.metrics)
    const term = s(obj(row.searchTermView).searchTerm)
    if (!term) continue
    list.push({
      term,
      clicks: num(m.clicks),
      costMicros: num(m.costMicros),
      campaignId: s(c.id),
      campaignName: s(c.name),
      adGroupId: s(ag.id) || null,
      adGroupName: s(ag.name) || null,
      keyword: null,
      keywordMatchType: null,
      bestMatch: false,
      reasonHits: reasonHits(term, reason),
    })
  }
  if (pmaxCampaigns.ok) {
    for (const r of pmaxCampaigns.rows) {
      const c = obj(obj(r).campaign)
      const terms = await searchTerms(search, customerId, date, { id: s(c.id), name: s(c.name), channel: 'PERFORMANCE_MAX' }, null, reason)
      if (terms.ok) list.push(...terms.list)
    }
  }
  return { ok: true, list }
}

