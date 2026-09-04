import { prisma } from '@/lib/db'
import { adsSearch } from '@/lib/google-ads'
import { secretSetting } from '@/lib/secret-settings'
import { evaluateRogueNumbers, editorialFields } from '@/lib/rogue-numbers'

/**
 * The Google Ads heartbeat: scheduled checks that file FINDINGS.
 *
 * A finding is a structured claim — what is wrong, on which entity, with the
 * evidence (window, sample, the numbers) attached — never prose. It stays
 * OPEN while the condition persists (lastSeenAt moves, no duplicate rows),
 * auto-RESOLVES when a later run no longer sees it, and DISMISSED means the
 * operator said "known, stop telling me" and is honoured until it resolves.
 *
 * DAILY is anomalies only: the things that cost money by tonight — spend
 * cliffs and spikes, disapproved ads, budget-capped campaigns, conversions
 * gone quiet, and somebody ELSE editing the account (the owner who cut a
 * budget from $150 to $1, found days later). Everything slower-moving
 * belongs to the weekly and monthly sweeps so the daily signal stays scary.
 *
 * Every evaluator is pure — rows in, drafts out — so thresholds can be
 * tested against saved API responses without credentials, same as
 * compareToStandard.
 */

export interface FindingDraft {
  check: string
  /** ALERT: money is burning now. REVIEW: read it at the desk. */
  severity: 'ALERT' | 'REVIEW'
  /** What the finding is about, for the dedupe key ("campaign:123"). */
  entity: string
  title: string
  detail: string
  evidence: Record<string, unknown>
}

type Row = Record<string, unknown>
const get = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))

const micros = (v: unknown): number => num(v) / 1_000_000
const money = (v: number): string => `$${v.toFixed(2)}`

/** UTC date string N days back. Windows are stated in every finding. */
export function dayString(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Evaluators — pure. Thresholds are named constants so the digest can quote
// them and a tuning change is one line with a diff.
// ---------------------------------------------------------------------------

/** A campaign has to have been spending this much per day before its silence
 * or its spike is worth an alert — below it, everything is noise. */
export const MIN_AVG_DAILY_SPEND = 10
export const CLIFF_FRACTION = 0.2
export const SPIKE_MULTIPLE = 2
export const MIN_SPIKE_DELTA = 20

export function evaluateSpend(rows: Row[], yesterday: string, windowStart: string): FindingDraft[] {
  // Rows are campaign × date. Group, then compare yesterday to the prior-7 mean.
  const byCampaign = new Map<string, { name: string; days: Map<string, number> }>()
  for (const row of rows) {
    const id = str(get(row, 'campaign.id'))
    if (!id) continue
    const entry = byCampaign.get(id) || { name: str(get(row, 'campaign.name')), days: new Map() }
    const date = str(get(row, 'segments.date'))
    entry.days.set(date, (entry.days.get(date) || 0) + micros(get(row, 'metrics.costMicros')))
    byCampaign.set(id, entry)
  }

  const findings: FindingDraft[] = []
  for (const [id, { name, days }] of byCampaign) {
    const spendYesterday = days.get(yesterday) || 0
    const prior: number[] = []
    for (const [date, cost] of days) if (date !== yesterday) prior.push(cost)
    if (prior.length < 5) continue // not enough window to claim anything
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length
    if (avg < MIN_AVG_DAILY_SPEND) continue

    const evidence = {
      window: `${windowStart}..${yesterday} (UTC)`,
      priorDays: prior.length,
      priorAvg: Number(avg.toFixed(2)),
      yesterday: Number(spendYesterday.toFixed(2)),
    }
    if (spendYesterday < avg * CLIFF_FRACTION) {
      findings.push({
        check: 'spend-cliff',
        severity: 'ALERT',
        entity: `campaign:${id}`,
        title: `${name}: spend fell off a cliff`,
        detail: `${money(spendYesterday)} yesterday against a ${money(avg)}/day average over the prior ${prior.length} days. An enabled campaign that stops spending is usually a payment failure, a disapproval, or an edit nobody mentioned.`,
        evidence,
      })
    } else if (spendYesterday >= avg * SPIKE_MULTIPLE && spendYesterday - avg >= MIN_SPIKE_DELTA) {
      findings.push({
        check: 'spend-spike',
        severity: 'ALERT',
        entity: `campaign:${id}`,
        title: `${name}: spend spiked ${(spendYesterday / avg).toFixed(1)}×`,
        detail: `${money(spendYesterday)} yesterday against a ${money(avg)}/day average over the prior ${prior.length} days.`,
        evidence,
      })
    }
  }
  return findings
}

/** Account had a real conversion habit and yesterday broke it. */
export const MIN_PRIOR_CONVERSIONS = 7

export function evaluateConversionsStopped(
  rows: Row[],
  yesterday: string,
  windowStart: string
): FindingDraft[] {
  let priorTotal = 0
  let yesterdayTotal = 0
  for (const row of rows) {
    const date = str(get(row, 'segments.date'))
    const conversions = num(get(row, 'metrics.conversions'))
    if (date === yesterday) yesterdayTotal += conversions
    else priorTotal += conversions
  }
  if (priorTotal < MIN_PRIOR_CONVERSIONS || yesterdayTotal > 0) return []
  return [
    {
      check: 'conversions-stopped',
      severity: 'ALERT',
      entity: 'account',
      title: 'Conversions stopped recording',
      detail: `${priorTotal.toFixed(0)} conversions over the prior week, zero yesterday. Either the phones went quiet or the tracking broke — and only one of those fixes itself.`,
      evidence: {
        window: `${windowStart}..${yesterday} (UTC)`,
        priorWeek: Number(priorTotal.toFixed(1)),
        yesterday: 0,
      },
    },
  ]
}

export function evaluateDisapproved(rows: Row[]): FindingDraft[] {
  return rows.map((row) => {
    const adId = str(get(row, 'adGroupAd.ad.id'))
    return {
      check: 'disapproved-ads',
      severity: 'ALERT' as const,
      entity: `ad:${adId}`,
      title: `Ad disapproved in ${str(get(row, 'campaign.name'))}`,
      detail: `Ad ${adId} in "${str(get(row, 'adGroup.name'))}" is ${str(get(row, 'adGroupAd.policySummary.approvalStatus'))}. It is enabled and serving nothing.`,
      evidence: {
        campaign: str(get(row, 'campaign.name')),
        adGroup: str(get(row, 'adGroup.name')),
        approvalStatus: str(get(row, 'adGroupAd.policySummary.approvalStatus')),
      },
    }
  })
}

export function evaluateBudgetLimited(rows: Row[]): FindingDraft[] {
  const findings: FindingDraft[] = []
  for (const row of rows) {
    const reasons = get(row, 'campaign.primaryStatusReasons')
    const list = Array.isArray(reasons) ? reasons.map(String) : []
    if (!list.includes('BUDGET_CONSTRAINED')) continue
    const id = str(get(row, 'campaign.id'))
    findings.push({
      check: 'budget-limited',
      severity: 'REVIEW',
      entity: `campaign:${id}`,
      title: `${str(get(row, 'campaign.name'))} is limited by budget`,
      detail:
        'Google reports this campaign budget-constrained — it stops serving before the day ends, so the budget decides which hours of buyers it meets.',
      evidence: { primaryStatusReasons: list },
    })
  }
  return findings
}

export function evaluateAccountChanges(rows: Row[], yesterday: string): FindingDraft[] {
  // Grouped by editor: the finding is "someone was in the account", with the
  // shapes of what they touched. Budget edits raise it to ALERT — that is
  // the $150 → $1 case.
  const byUser = new Map<string, { count: number; types: Map<string, number> }>()
  for (const row of rows) {
    const user = str(get(row, 'changeEvent.userEmail')) || '(unknown)'
    const type = str(get(row, 'changeEvent.changeResourceType'))
    const entry = byUser.get(user) || { count: 0, types: new Map() }
    entry.count += 1
    entry.types.set(type, (entry.types.get(type) || 0) + 1)
    byUser.set(user, entry)
  }
  const findings: FindingDraft[] = []
  for (const [user, { count, types }] of byUser) {
    const shapes = [...types.entries()].map(([t, n]) => `${t}×${n}`).join(', ')
    const touchedBudget = types.has('CAMPAIGN_BUDGET')
    findings.push({
      check: 'account-changes',
      severity: touchedBudget ? 'ALERT' : 'REVIEW',
      entity: `changes:${yesterday}:${user}`,
      title: touchedBudget
        ? `${user} changed a campaign budget`
        : `${user} made ${count} change${count === 1 ? '' : 's'} in the account`,
      detail: `${count} change${count === 1 ? '' : 's'} on ${yesterday} (UTC): ${shapes}. If this was you, dismiss it; if not, look before the month does the arithmetic.`,
      evidence: { date: yesterday, user, count, types: Object.fromEntries(types) },
    })
  }
  return findings
}

/**
 * The website-call conversion is watching a number the site does not show.
 *
 * Google swaps ONE number on the page and reports calls to it. Set the
 * action up against the shop's old line, then move the site onto a tracking
 * number, and Google finds nothing to swap — no swap, no reported call,
 * while the Ads UI still shows the action as installed. Needs no API call:
 * both numbers are already ours.
 */
export function evaluateCallNumberMismatch(input: {
  conversionNumber: string | null
  siteNumber: string | null
}): FindingDraft[] {
  const last10 = (v: string | null) => (v || '').replace(/\D/g, '').slice(-10)
  const watching = last10(input.conversionNumber)
  const showing = last10(input.siteNumber)
  if (!watching || !showing || watching === showing) return []
  return [
    {
      check: 'call-number-mismatch',
      severity: 'ALERT',
      entity: 'account',
      title: 'Website calls are not being counted — wrong number on the conversion',
      detail: `The Google call conversion watches for ${input.conversionNumber}, but the site shows ${input.siteNumber}. Google only swaps a number it finds on the page, so no website call is being reported. Edit the conversion action's phone number to the one the site shows.`,
      evidence: {
        conversionNumber: input.conversionNumber,
        siteNumber: input.siteNumber,
        why: 'Google Ads website-call conversions replace a specific number printed on the page',
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// The runner: fetch per account, evaluate, file, auto-resolve, summarize.
// ---------------------------------------------------------------------------

export interface FiledFinding {
  clientId: string
  clientName: string
  check: string
  severity: string
  title: string
  detail: string
}

export interface DailyRunSummary {
  accounts: number
  errors: Array<{ client: string; error: string }>
  newFindings: FiledFinding[]
  resolved: number
  stillOpen: number
}

export async function runDailyAdsChecks(): Promise<DailyRunSummary> {
  const clients = await listAdsClients()

  const yesterday = dayString(1)
  const windowStart = dayString(8)
  const summary: DailyRunSummary = {
    accounts: clients.length,
    errors: [],
    newFindings: [],
    resolved: 0,
    stillOpen: 0,
  }

  for (const client of clients) {
    const customerId = client.adsTracking?.googleAdsCustomerId as string
    const drafts: FindingDraft[] = []
    // Checks whose fetch failed must NOT auto-resolve their old findings —
    // an API hiccup would otherwise read as "all clear".
    const ranChecks = new Set<string>()

    const spendRows = await adsSearch(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status, segments.date,
              metrics.cost_micros, metrics.conversions
       FROM campaign
       WHERE campaign.status = 'ENABLED'
         AND segments.date BETWEEN '${windowStart}' AND '${yesterday}'`
    )
    if (spendRows.ok) {
      drafts.push(...evaluateSpend(spendRows.rows, yesterday, windowStart))
      drafts.push(...evaluateConversionsStopped(spendRows.rows, yesterday, windowStart))
      ranChecks.add('spend-cliff').add('spend-spike').add('conversions-stopped')
    } else {
      summary.errors.push({ client: client.businessName, error: spendRows.error })
    }

    const disapproved = await adsSearch(
      customerId,
      `SELECT campaign.name, campaign.status, ad_group.name, ad_group.status,
              ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status
       FROM ad_group_ad
       WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
         AND ad_group_ad.status = 'ENABLED'
         AND ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'`
    )
    if (disapproved.ok) {
      drafts.push(...evaluateDisapproved(disapproved.rows))
      ranChecks.add('disapproved-ads')
    } else {
      summary.errors.push({ client: client.businessName, error: disapproved.error })
    }

    const statuses = await adsSearch(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status,
              campaign.primary_status, campaign.primary_status_reasons
       FROM campaign
       WHERE campaign.status = 'ENABLED'`
    )
    if (statuses.ok) {
      drafts.push(...evaluateBudgetLimited(statuses.rows))
      ranChecks.add('budget-limited')
    } else {
      summary.errors.push({ client: client.businessName, error: statuses.error })
    }

    // Costs nothing — both numbers are already in our database — so it runs
    // even when Google is unreachable today.
    drafts.push(
      ...evaluateCallNumberMismatch({
        conversionNumber: client.adsTracking?.callPhoneNumber ?? null,
        siteNumber: client.trackingNumbers[0]?.phoneNumber ?? null,
      })
    )
    ranChecks.add('call-number-mismatch')

    const changes = await adsSearch(
      customerId,
      `SELECT change_event.change_date_time, change_event.user_email,
              change_event.change_resource_type, change_event.resource_change_operation
       FROM change_event
       WHERE change_event.change_date_time >= '${yesterday} 00:00:00'
         AND change_event.change_date_time <= '${yesterday} 23:59:59'
       LIMIT 200`
    )
    if (changes.ok) {
      drafts.push(...evaluateAccountChanges(changes.rows, yesterday))
      ranChecks.add('account-changes')
    } else {
      summary.errors.push({ client: client.businessName, error: changes.error })
    }

    await fileFindings(client, customerId, 'DAILY', drafts, ranChecks, summary)
  }

  await runSiteContentChecks(summary)
  return summary
}

/**
 * Site-copy checks, for EVERY live client rather than only the ones running
 * ads. An untracked number printed in an FAQ costs a shop the same call
 * whether or not this platform manages their Google account, and the sweep
 * that already runs every morning is the only thing that looks at fifteen
 * sites without being asked.
 *
 * Filed through the same pipeline, so it dedupes, auto-resolves when the copy
 * is fixed, and can be dismissed. Its own fileFindings call is safe alongside
 * the ads one: auto-resolve only touches checks named in `ranChecks`.
 */
export async function runSiteContentChecks(
  summary: Pick<DailyRunSummary, 'newFindings' | 'resolved' | 'stillOpen'>
): Promise<void> {
  const clients = await prisma.client
    .findMany({
      where: { status: { in: ['ACTIVE', 'ONBOARDING'] } },
      select: {
        id: true,
        businessName: true,
        phone: true,
        siteDisplayPhone: true,
        adsTracking: { select: { googleAdsCustomerId: true } },
        trackingNumbers: {
          where: { active: true, useOnSite: true },
          select: { phoneNumber: true },
          take: 1,
        },
        siteContent: {
          select: { warrantyText: true, footerBlurb: true, faq: true, chapters: true },
        },
        cityContent: { select: { city: true, body: true } },
        customPages: {
          where: { publishedAt: { not: null } },
          select: { path: true, title: true, bodyHtml: true },
        },
      },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  for (const client of clients) {
    // The number the SITE shows, resolved the same way site-phone does it.
    const siteNumber =
      client.trackingNumbers[0]?.phoneNumber || client.siteDisplayPhone || client.phone
    const drafts = evaluateRogueNumbers({
      fields: editorialFields({
        content: client.siteContent,
        cityContent: client.cityContent,
        keptPages: client.customPages,
      }),
      siteNumber,
    })
    await fileFindings(
      client,
      client.adsTracking?.googleAdsCustomerId || '',
      'DAILY',
      drafts,
      new Set(['rogue-phone-number']),
      summary
    )
  }
}

/**
 * File drafts against the findings table with the full lifecycle: create new,
 * freshen OPEN, reopen RESOLVED, honour DISMISSED, and auto-resolve what
 * this run no longer sees — resolving only for checks whose fetch actually
 * ran, so an API hiccup can never read as all-clear. Shared by every
 * cadence; the pipeline is the same whether the check is a spend cliff or a
 * playbook rule.
 */
export async function fileFindings(
  client: { id: string; businessName: string },
  customerId: string,
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  drafts: FindingDraft[],
  ranChecks: Set<string>,
  summary: Pick<DailyRunSummary, 'newFindings' | 'resolved' | 'stillOpen'>
): Promise<void> {
  const produced = new Set<string>()
  for (const draft of drafts) {
    const dedupeKey = `${client.id}:${draft.check}:${draft.entity}`
    produced.add(dedupeKey)
    const existing = await prisma.adsFinding
      .findUnique({ where: { dedupeKey }, select: { id: true, status: true } })
      .catch(() => null)
    if (!existing) {
      await prisma.adsFinding.create({
        data: {
          clientId: client.id,
          customerId,
          cadence,
          check: draft.check,
          dedupeKey,
          severity: draft.severity,
          title: draft.title,
          detail: draft.detail,
          evidence: draft.evidence as never,
        },
      })
      summary.newFindings.push({
        clientId: client.id,
        clientName: client.businessName,
        check: draft.check,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
      })
    } else if (existing.status === 'OPEN') {
      // Still true: freshen the numbers, keep one row.
      await prisma.adsFinding.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          detail: draft.detail,
          evidence: draft.evidence as never,
        },
      })
      summary.stillOpen += 1
    } else if (existing.status === 'RESOLVED') {
      // It came back. Reopen the same row so the history is one thread.
      await prisma.adsFinding.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          resolvedAt: null,
          lastSeenAt: new Date(),
          detail: draft.detail,
          evidence: draft.evidence as never,
        },
      })
      summary.newFindings.push({
        clientId: client.id,
        clientName: client.businessName,
        check: draft.check,
        severity: draft.severity,
        title: `${draft.title} (returned)`,
        detail: draft.detail,
      })
    }
    // DISMISSED: the operator said stop telling me. Honoured while it lasts.
  }

  // Auto-resolve what this run no longer sees — only for checks that ran.
  const open = await prisma.adsFinding
    .findMany({
      where: { clientId: client.id, cadence, status: 'OPEN' },
      select: { id: true, dedupeKey: true, check: true },
    })
    .catch(() => [])
  for (const finding of open) {
    if (!ranChecks.has(finding.check) || produced.has(finding.dedupeKey)) continue
    await prisma.adsFinding.update({
      where: { id: finding.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
    summary.resolved += 1
  }
}

/** Every client whose account the sweeps should read. */
export async function listAdsClients() {
  return prisma.client.findMany({
    where: {
      status: { in: ['ACTIVE', 'ONBOARDING'] },
      adsTracking: { googleAdsCustomerId: { not: null } },
    },
    select: {
      id: true,
      businessName: true,
      adsTracking: { select: { googleAdsCustomerId: true, callPhoneNumber: true } },
      trackingNumbers: {
        where: { active: true, useOnSite: true },
        select: { phoneNumber: true },
        take: 1,
      },
    },
    orderBy: { businessName: 'asc' },
  })
}

// ---------------------------------------------------------------------------
// The digest — sent only when something NEW appeared, so an empty morning
// sends nothing and the email means something when it arrives.
// ---------------------------------------------------------------------------

export async function emailFindingsDigest(summary: DailyRunSummary): Promise<{
  sent: boolean
  error?: string
}> {
  if (summary.newFindings.length === 0) return { sent: false }
  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  if (!to) return { sent: false, error: 'No ADMIN_EMAIL configured' }
  const apiKey = await secretSetting('RESEND_API_KEY')
  if (!apiKey) return { sent: false, error: 'No Resend API key' }

  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = process.env.APP_URL || 'https://glassleads.app'

  const byClient = new Map<string, FiledFinding[]>()
  for (const f of summary.newFindings) {
    byClient.set(f.clientName, [...(byClient.get(f.clientName) || []), f])
  }
  const alerts = summary.newFindings.filter((f) => f.severity === 'ALERT').length

  const sections = [...byClient.entries()]
    .map(
      ([clientName, findings]) => `
      <h2 style="margin:20px 0 6px;font-size:16px">${esc(clientName)}</h2>
      ${findings
        .map(
          (f) => `<div style="border-left:3px solid ${f.severity === 'ALERT' ? '#dc2626' : '#d97706'};padding:6px 12px;margin:0 0 8px;background:#f9fafb">
            <p style="margin:0;font-weight:700;font-size:14px">${esc(f.title)}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#374151">${esc(f.detail)}</p>
          </div>`
        )
        .join('')}`
    )
    .join('')

  try {
    const configured = (await secretSetting('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    const address = /<([^>]+)>/.exec(configured)?.[1] || configured
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const sent = await resend.emails.send({
      from: `GlassLeads <${address}>`,
      to: [to],
      subject:
        alerts > 0
          ? `Google Ads: ${alerts} alert${alerts === 1 ? '' : 's'} need${alerts === 1 ? 's' : ''} a look today`
          : `Google Ads: ${summary.newFindings.length} new finding${summary.newFindings.length === 1 ? '' : 's'}`,
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:18px">Daily Google Ads check</h1>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">${summary.accounts} account${summary.accounts === 1 ? '' : 's'} checked · ${summary.newFindings.length} new · ${summary.resolved} cleared on their own${summary.errors.length ? ` · ${summary.errors.length} account${summary.errors.length === 1 ? '' : 's'} unreadable` : ''}</p>
    ${sections}
    <p style="margin:18px 0 0;font-size:13px"><a href="${esc(base)}/admin/ads-findings" style="color:#2563eb">Open the findings list</a></p>
  </div>
</body></html>`,
      text: summary.newFindings
        .map((f) => `[${f.severity}] ${f.clientName} — ${f.title}\n${f.detail}`)
        .join('\n\n'),
    })
    if (sent.error) return { sent: false, error: sent.error.message }
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}
