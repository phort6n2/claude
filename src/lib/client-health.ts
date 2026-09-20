import { prisma } from '@/lib/db'
import { getClientReadiness } from '@/lib/client-readiness'
import { evaluateCallConnect, WINDOW_DAYS as CONNECT_WINDOW_DAYS } from '@/lib/call-connect-health'
import { evaluateCallRecording } from '@/lib/call-recording-health'
import { LIVE_STATUSES } from '@/lib/site-preview'
import type { ReadinessCheck } from '@/lib/client-readiness'

/**
 * ONE ROW PER CLIENT, AND EVERY COLUMN IS SOMETHING THAT FAILS SILENTLY.
 *
 * The dashboard this replaced counted leads. Leads are the one thing that is
 * never quietly wrong — a lead either arrives or somebody rings up about it.
 * What this platform actually loses money to is the opposite: a `<Dial record>`
 * attribute one letter off, a Twilio namespace import, a number bought with no
 * SmsUrl, an alert list with nobody on it. Every one of those produced no
 * error, no missing page and no wrong row — only an absence that looks exactly
 * like a quiet week. Each column here is one of those, asked across the whole
 * book at once, because "which of my fifteen shops is silently broken this
 * morning" is a question nothing in the app could answer.
 *
 * A DASH IS NOT A FAILURE, AND THAT IS WHAT KEEPS THE RED HONEST. A self-serve
 * client has no ad account; a shop with no tracking number cannot have calls
 * that fail to record. Marking those red would put most of the book in red
 * permanently, which is how a status board stops being read — the same reason
 * `client-readiness.ts` refuses to report checks that are merely optional and
 * `call-connect-health.ts` fires only on `failed`. A cross here always means
 * somebody has something to do.
 */

export type CellState = 'ok' | 'bad' | 'warn' | 'na'

export interface HealthCell {
  state: CellState
  /** What the cell says when it is not ok — the operator's language. */
  detail: string
  /** Shown in the cell for a count, e.g. "3". */
  badge?: string
}

export interface ClientHealthRow {
  id: string
  businessName: string
  status: string
  /** The client page, for the name link. */
  href: string
  cells: Record<HealthColumnId, HealthCell>
  /** Sorts the worst clients to the top. */
  score: number
}

export type HealthColumnId =
  | 'setup'
  | 'site'
  | 'leads'
  | 'calls'
  | 'recording'
  | 'sms'
  | 'ads'
  | 'findings'

export interface HealthColumn {
  id: HealthColumnId
  /** Two or three characters in the header — the table is fifteen rows wide. */
  short: string
  label: string
  /** What a green tick in this column actually promises. */
  meaning: string
}

export const HEALTH_COLUMNS: HealthColumn[] = [
  { id: 'setup', short: 'Setup', label: 'Setup finished', meaning: 'Every required onboarding check passes.' },
  { id: 'site', short: 'Site', label: 'Site live', meaning: 'Status is live and the site answers on its own subdomain.' },
  { id: 'leads', short: 'Leads', label: 'Leads reach the shop', meaning: 'Somebody is alerted or a destination is forwarding, and the last delivery worked.' },
  { id: 'calls', short: 'Calls', label: 'Calls connecting', meaning: 'Forwarded calls are reaching their phone.' },
  { id: 'recording', short: 'Rec', label: 'Calls recorded', meaning: 'Answered calls are producing recordings to score.' },
  { id: 'sms', short: 'SMS', label: 'Texts land in the app', meaning: 'Their tracking number has an SmsUrl, so a texted photo is not swallowed.' },
  { id: 'ads', short: 'Ads', label: 'Ad tracking wired', meaning: 'A conversion action is configured for the tag that is loading.' },
  { id: 'findings', short: 'Action', label: 'Open findings', meaning: 'What the morning sweep has filed and nobody has cleared.' },
]

const ok = (detail = ''): HealthCell => ({ state: 'ok', detail })
const na = (detail: string): HealthCell => ({ state: 'na', detail })
const bad = (detail: string, badge?: string): HealthCell => ({ state: 'bad', detail, badge })
const warn = (detail: string, badge?: string): HealthCell => ({ state: 'warn', detail, badge })

/** Worst first. A red is worth more than an amber; a dash is worth nothing. */
const WEIGHT: Record<CellState, number> = { bad: 10, warn: 3, ok: 0, na: 0 }

/** Recording lands a minute or two after the call, so recent calls prove nothing. */
const RECORDING_SETTLE_MINUTES = 60
const RECORDING_MIN_SECONDS = 10

export async function getClientHealth(): Promise<ClientHealthRow[]> {
  /* EVERY client, PAUSED included. Paused is the kill switch rather than a
     deletion — the listing, the binding and the history are all kept — so a
     paused shop still belongs on the board, greyed, where somebody can see it
     is paused. Dropping it is how a client stays switched off for a month
     after they asked to come back. */
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      businessName: true,
      status: true,
      siteSubdomain: true,
      callCoachingEnabled: true,
      adsTracking: {
        select: {
          googleAdsCustomerId: true,
          conversionId: true,
          leadConversionLabel: true,
          bingUetTagId: true,
          bingLeadEventAction: true,
        },
      },
      trackingNumbers: {
        select: { id: true, phoneNumber: true, forwardTo: true, active: true, recordCalls: true, smsUrl: true },
      },
    },
    orderBy: { businessName: 'asc' },
  })

  const now = new Date()
  const since = new Date(now.getTime() - CONNECT_WINDOW_DAYS * 86_400_000)

  /* THREE QUERIES FOR THE WHOLE BOOK, not three per client. Fifteen clients
     each firing their own aggregate is how an admin page that opens instantly
     with four shops takes six seconds with forty. */
  const [callRows, findingRows] = await Promise.all([
    prisma.lead.findMany({
      where: { twilioCallSid: { not: null }, createdAt: { gte: since } },
      select: {
        clientId: true,
        createdAt: true,
        callStatus: true,
        callDurationSecs: true,
        callRecordingUrl: true,
        trackingNumber: true,
      },
      take: 5000,
    }).catch(() => null),
    prisma.adsFinding.groupBy({
      by: ['clientId', 'severity'],
      where: { status: 'OPEN' },
      _count: { _all: true },
    }).catch(() => null),
  ])

  const callsByClient = new Map<string, NonNullable<typeof callRows>>()
  for (const row of callRows || []) {
    const list = callsByClient.get(row.clientId) || []
    list.push(row)
    callsByClient.set(row.clientId, list)
  }
  const findingsByClient = new Map<string, { alerts: number; total: number }>()
  for (const row of findingRows || []) {
    const cur = findingsByClient.get(row.clientId) || { alerts: 0, total: 0 }
    cur.total += row._count._all
    if (row.severity === 'ALERT') cur.alerts += row._count._all
    findingsByClient.set(row.clientId, cur)
  }

  /* Readiness is the expensive one — a dozen queries per client — so it runs
     a few at a time rather than fifteen at once. A burst that large against
     the pooled connection is how a page that works locally times out in
     production, which this codebase has already paid for once. */
  const readiness = new Map<string, Awaited<ReturnType<typeof getClientReadiness>>>()
  const CONCURRENCY = 4
  for (let i = 0; i < clients.length; i += CONCURRENCY) {
    const slice = clients.slice(i, i + CONCURRENCY)
    const reports = await Promise.all(
      slice.map((c) => getClientReadiness(c.id).catch(() => null))
    )
    slice.forEach((c, n) => {
      const report = reports[n]
      if (report) readiness.set(c.id, report)
    })
  }

  return clients.map((client) => {
    const cells = healthCells({
      status: client.status,
      siteSubdomain: client.siteSubdomain,
      callCoachingEnabled: client.callCoachingEnabled,
      adsTracking: client.adsTracking,
      trackingNumbers: client.trackingNumbers,
      readiness: readiness.get(client.id) ?? null,
      calls: (callsByClient.get(client.id) || []).map((c) => ({
        at: c.createdAt,
        status: c.callStatus,
        seconds: c.callDurationSecs,
        recorded: !!c.callRecordingUrl,
        line: c.trackingNumber,
      })),
      findings: findingRows === null ? null : findingsByClient.get(client.id) || { alerts: 0, total: 0 },
      now,
    })

    return {
      id: client.id,
      businessName: client.businessName,
      status: client.status,
      href: `/admin/clients/${client.id}`,
      cells,
      score: Object.values(cells).reduce((n, c) => n + WEIGHT[c.state], 0),
    }
  })
}

/** One client's worth of already-fetched facts. */
export interface HealthInput {
  status: string
  siteSubdomain: string | null
  callCoachingEnabled: boolean
  adsTracking: {
    conversionId: string | null
    leadConversionLabel: string | null
    bingUetTagId: string | null
    bingLeadEventAction: string | null
  } | null
  trackingNumbers: Array<{ active: boolean; recordCalls: boolean; smsUrl: string | null; forwardTo: string }>
  /** Null when the readiness read failed — reported as such, never as a pass. */
  readiness: { requiredOpen: number; recommendedOpen: number; checks: ReadinessCheck[] } | null
  calls: Array<{
    at: Date
    status: string | null
    seconds: number | null
    recorded: boolean
    line: string | null
  }>
  /** Null when the findings query failed. */
  findings: { alerts: number; total: number } | null
  now: Date
}

/**
 * PURE: facts in, cells out.
 *
 * Split from the fetch for the same reason `compareToStandard()` is — the rule
 * that decides whether a client shows a cross is the part worth checking, and
 * it cannot be checked at all if reaching it needs a database and fifteen live
 * shops. `scripts/check-client-health.ts` drives this directly.
 */
export function healthCells(input: HealthInput): Record<HealthColumnId, HealthCell> {
  const report = input.readiness
  const active = input.trackingNumbers.filter((n) => n.active)
  const calls = input.calls
  const findings = input.findings
  const settledBefore = new Date(input.now.getTime() - RECORDING_SETTLE_MINUTES * 60_000)


  // ---- Setup ----
  const setup: HealthCell = !report
    ? warn('Could not read this client’s readiness.')
    : report.requiredOpen > 0
      ? bad(
          `${report.requiredOpen} required check${report.requiredOpen === 1 ? '' : 's'} outstanding: ${report.checks
            .filter((c) => !c.ok && c.severity === 'required')
            .map((c) => c.label)
            .join(', ')}.`,
          String(report.requiredOpen)
        )
      : report.recommendedOpen > 0
        ? warn(
            `Everything required is done. ${report.recommendedOpen} recommended left: ${report.checks
              .filter((c) => !c.ok && c.severity === 'recommended')
              .map((c) => c.label)
              .join(', ')}.`,
            String(report.recommendedOpen)
          )
        : ok()

  // ---- Site ----
  const live = (LIVE_STATUSES as readonly string[]).includes(input.status)
  const site: HealthCell = !live
    ? na(`Status is ${input.status}, so the site is deliberately not public.`)
    : input.siteSubdomain
      ? ok()
      : bad('No subdomain, so the site only answers on the long /sites/ URL.')

  // ---- Leads reach the shop ----
  const leadCheck = report?.checks.find((c) => c.id === 'lead-reach')
  const deliveryCheck = report?.checks.find((c) => c.id === 'delivery-health')
  const leads: HealthCell = !report
    ? warn('Could not read the lead setup.')
    : leadCheck && !leadCheck.ok
      ? bad(leadCheck.detail)
      : deliveryCheck && !deliveryCheck.ok
        ? bad(deliveryCheck.detail)
        : ok()

  /* ---- Calls connecting ----
     The SAME evaluator the morning sweep files findings with. A dashboard
     that judged this its own way would disagree with the queue beside it,
     and whichever one somebody believed would be a coin toss. */
  const connect = evaluateCallConnect({
    calls: calls.map((c) => ({ at: c.at.toISOString(), status: c.status || '', line: c.line })),
    forwardTargets: [...new Set(active.map((n) => n.forwardTo))],
  })
  const callsCell: HealthCell =
    active.length === 0
      ? na('No tracking number, so there are no forwarded calls to judge.')
      : !connect.judged
        ? na(`Fewer than the minimum calls in ${CONNECT_WINDOW_DAYS} days — not enough to say.`)
        : connect.drafts.length > 0
          ? (connect.drafts[0].severity === 'ALERT' ? bad : warn)(connect.drafts[0].title)
          : ok()

  // ---- Calls recorded ----
  const recordingOn = active.some((n) => n.recordCalls)
  const answered = calls.filter(
    (c) => c.status === 'completed' && (c.seconds ?? 0) >= RECORDING_MIN_SECONDS && c.at < settledBefore
  )
  const recording = evaluateCallRecording({
    recordingEnabled: recordingOn,
    coachingEnabled: input.callCoachingEnabled,
    calls: answered.map((c) => ({ at: c.at.toISOString(), seconds: c.seconds ?? 0, recorded: c.recorded })),
  })
  const recordingCell: HealthCell = !recordingOn
    ? na('Recording is switched off on their numbers.')
    : !recording.judged
      ? na('No answered calls old enough to have a recording yet.')
      : recording.drafts.length > 0
        ? (recording.drafts[0].severity === 'ALERT' ? bad : warn)(recording.drafts[0].title)
        : ok()

  /* ---- Texts ----
     Read off what we RECORDED setting, never off whether a text has ever
     arrived: a number configured correctly that nobody has texted looks
     exactly like one that swallows them, and reasoning from that silence is
     what let the swallowed photos go unnoticed for months in the first place. */
  const unpointed = active.filter((n) => !n.smsUrl)
  const sms: HealthCell =
    active.length === 0
      ? na('No tracking number, so there is nothing for a text to arrive on.')
      : unpointed.length > 0
        ? bad(
            `${unpointed.length} of ${active.length} number${active.length === 1 ? '' : 's'} has no SmsUrl on record, so a texted photo is swallowed. Maintenance → “Point every tracking number’s texts at the app”.`,
            unpointed.length === active.length ? undefined : String(unpointed.length)
          )
        : ok()

  // ---- Ads ----
  const t = input.adsTracking
  const hasGoogle = !!t?.conversionId
  const hasBing = !!t?.bingUetTagId
  const ads: HealthCell = !hasGoogle && !hasBing
    ? na('No ad tag configured — self-serve, nothing to fix here.')
    : hasGoogle && !t?.leadConversionLabel
      ? bad('A Google tag is loading but no lead conversion is set, so form submissions report nothing.')
      : hasBing && !t?.bingLeadEventAction
        ? bad('The UET tag is installed but no event action is set, so no goal can match.')
        : ok()

  // ---- Open findings ----
  const findingsCell: HealthCell = !findings
    ? warn('Could not read the findings queue.')
    : findings.total === 0
      ? ok()
      : findings.alerts > 0
        ? bad(
            `${findings.alerts} alert${findings.alerts === 1 ? '' : 's'} of ${findings.total} open.`,
            String(findings.total)
          )
        : warn(`${findings.total} open to review.`, String(findings.total))

  return {
    setup,
    site,
    leads,
    calls: callsCell,
    recording: recordingCell,
    sms,
    ads,
    findings: findingsCell,
  }
}
