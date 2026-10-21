import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'
import { notifyAllAdmins } from '@/lib/push-notifications'
import { getCampaignReport } from '@/lib/campaign-report-fetch'
import {
  UNDERSPEND_ALERT_DAYS,
  UNDERSPEND_SHARE,
  addDays,
  underspendingBudgets,
  type CampaignReportData,
  type Underspend,
} from '@/lib/campaign-report'

/**
 * THE MORNING "NOT SPENDING ITS BUDGET" ALERT — a push to the operator's phone
 * and an email, for every account under the manager (the same list the
 * campaign table shows, hidden accounts excluded). The rule is the table's
 * own (`underspendingBudgets`), over the last three COMPLETE days, so the
 * alert and the mark on the screen can never disagree.
 *
 * It alerts on what is NEW. The campaigns it has already told the operator
 * about are kept in one Setting row; one that is still under-spending
 * tomorrow does not ring again, one that recovers drops off the list, and if
 * it slips again later it is new again. A morning with nothing new sends
 * nothing — an alert that fires every day about the same campaign is how
 * alerts stop being read.
 */

const STATE_KEY = 'BUDGET_PACING_ALERTED'

export interface PacingHit {
  key: string
  accountName: string
  customerId: string
  currency: string
  underspend: Underspend
}

/** Pure: every budget under-spending over the last three complete days. */
export function findUnderspending(data: CampaignReportData): PacingHit[] {
  const hits: PacingHit[] = []
  for (const a of data.accounts) {
    const w = { start: addDays(a.today, -UNDERSPEND_ALERT_DAYS), end: addDays(a.today, -1), days: UNDERSPEND_ALERT_DAYS }
    for (const u of underspendingBudgets(a, w)) {
      hits.push({ key: `${a.customerId}:${u.budgetKey}`, accountName: a.name, customerId: a.customerId, currency: a.currency, underspend: u })
    }
  }
  return hits
}

/** Pure: which of today's hits the operator has not already been told about. */
export function newSince(hits: PacingHit[], alreadyAlerted: Record<string, string>): PacingHit[] {
  return hits.filter((h) => !alreadyAlerted[h.key])
}

function money(micros: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(micros / 1_000_000)
  } catch {
    return `${Math.round(micros / 1_000_000)} ${currency}`
  }
}

export function hitLine(h: PacingHit): string {
  const u = h.underspend
  return `${h.accountName} — ${u.names.join(', ')}: ${money(u.spentMicros / u.days, h.currency)}/day of ${money(
    u.budgetMicros,
    h.currency
  )}/day (${Math.round(u.share * 100)}%)`
}

async function readState(): Promise<Record<string, string>> {
  const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } })
  if (!row) return {}
  try {
    const v = JSON.parse(row.value)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

async function writeState(state: Record<string, string>): Promise<void> {
  const value = JSON.stringify(state)
  await prisma.setting.upsert({
    where: { key: STATE_KEY },
    // Campaign ids and dates, nothing secret — stored in the clear.
    create: { key: STATE_KEY, value, encrypted: false },
    update: { value, encrypted: false },
  })
}

async function email(hits: PacingHit[], fresh: Set<string>, readErrors: string[]): Promise<{ sent: boolean; error?: string }> {
  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  if (!to) return { sent: false, error: 'No ADMIN_EMAIL configured' }
  const apiKey = await secretSetting('RESEND_API_KEY')
  if (!apiKey) return { sent: false, error: 'No Resend API key' }
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = process.env.APP_URL || 'https://glassleads.app'
  const newCount = hits.filter((h) => fresh.has(h.key)).length
  const items = hits
    .map(
      (h) =>
        `<li style="margin:0 0 6px;font-size:14px">${fresh.has(h.key) ? '<strong>NEW</strong> · ' : ''}${esc(hitLine(h))}</li>`
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
      subject: `Google Ads: ${newCount} campaign${newCount === 1 ? ' is' : 's are'} not spending the budget`,
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:18px">Campaigns not spending their budget</h1>
    <p style="margin:0 0 12px;font-size:13px;color:#6b7280">Under ${Math.round(UNDERSPEND_SHARE * 100)}% of the daily budget, on average, over the last ${UNDERSPEND_ALERT_DAYS} complete days.</p>
    <ul style="padding-left:18px;margin:0">${items}</ul>
    ${readErrors.length ? `<p style="margin:12px 0 0;font-size:13px;color:#b91c1c">Could not read: ${esc(readErrors.join(', '))}</p>` : ''}
    <p style="margin:18px 0 0;font-size:13px"><a href="${esc(base)}/master-leads/campaigns?range=3d" style="color:#2563eb">Open the campaign table</a></p>
  </div>
</body></html>`,
      text: hits.map((h) => `${fresh.has(h.key) ? 'NEW ' : ''}${hitLine(h)}`).join('\n'),
    })
    if (sent.error) return { sent: false, error: sent.error.message }
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}

export async function runBudgetPacing(opts: { dryRun?: boolean } = {}) {
  const data = await getCampaignReport({ fresh: true })
  if (data.error) return { ok: false as const, error: data.error }
  const readErrors = data.accounts.filter((a) => a.error).map((a) => a.name)

  const hits = findUnderspending(data)
  const state = await readState()
  const fresh = newSince(hits, state)
  const result = {
    ok: true as const,
    dryRun: !!opts.dryRun,
    underspending: hits.map(hitLine),
    new: fresh.map(hitLine),
    readErrors,
    push: null as null | { sent: number; failed: number },
    email: null as null | { sent: boolean; error?: string },
  }
  if (opts.dryRun) return result

  if (fresh.length > 0) {
    const first = fresh[0]
    result.push = await notifyAllAdmins({
      title:
        fresh.length === 1
          ? `${first.accountName}: not spending its budget`
          : `${fresh.length} campaigns not spending their budget`,
      body: fresh.length === 1 ? hitLine(first) : fresh.map((h) => h.accountName).join(', '),
      tag: 'budget-pacing',
      data: { url: '/master-leads/campaigns?range=3d', type: 'budget-pacing' },
    })
    result.email = await email(hits, new Set(fresh.map((h) => h.key)), readErrors)
  }

  // Remember what is under-spending NOW: keep the first-alerted date for the
  // ones still there, add the new ones, and forget the ones that recovered so
  // a later relapse alerts again. Written even when nothing was sent, so a
  // recovery is recorded.
  const today = new Date().toISOString().slice(0, 10)
  const next: Record<string, string> = {}
  for (const h of hits) next[h.key] = state[h.key] || today
  // A read that failed must not "forget" an account's alerts and re-send them
  // tomorrow when the read succeeds — keep its old entries untouched.
  for (const a of data.accounts.filter((x) => x.error)) {
    for (const [k, v] of Object.entries(state)) if (k.startsWith(`${a.customerId}:`)) next[k] = v
  }
  await writeState(next)
  return result
}
