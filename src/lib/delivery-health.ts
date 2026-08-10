import { prisma } from '@/lib/db'

/**
 * Which clients' leads are not reaching them.
 *
 * A destination that starts rejecting deliveries is the quietest serious
 * failure the platform has. The lead is captured, so nothing looks broken
 * here; it is simply never forwarded, the retries run out over 24 hours, and
 * the first person to notice is the shop wondering why the phone stopped.
 *
 * There is no alerting state on the schema, and adding a column to
 * WebhookDestination means running SQL before the deploy or breaking every
 * query on that table. The last-alerted timestamps live in Setting instead —
 * a JSON blob keyed by destination id, which is exactly enough.
 */

const ALERT_STATE_KEY = 'LEAD_DELIVERY_ALERT_STATE'
/** Re-alert about the same destination at most this often. */
const REALERT_HOURS = 6

export interface FailingDestination {
  destinationId: string
  label: string
  url: string
  clientId: string
  businessName: string
  /** Deliveries to this destination currently sitting FAILED. */
  failedCount: number
  /** HTTP status of the most recent attempt, when there was one. */
  responseStatus: number | null
  lastError: string | null
  lastAttemptAt: string | null
  /** Plain-English cause, derived from the status. */
  diagnosis: string
}

/**
 * Turn an HTTP status into the thing to actually go and fix.
 *
 * "Destination responded 405" is accurate and tells nobody what to do. The
 * status is the single most diagnostic fact available and each one points at
 * a different mistake, so it is worth spelling out.
 */
export function diagnose(status: number | null, error: string | null): string {
  if (status === null) {
    return error?.toLowerCase().includes('timeout')
      ? 'The destination did not respond in time. It may be down, or slow enough that the request is being abandoned.'
      : 'The request never got a response. Usually a URL that no longer resolves, or DNS/TLS failing.'
  }
  if (status === 404) return 'That URL does not exist at the destination. It was probably deleted or regenerated — get a fresh webhook URL and paste it in.'
  if (status === 405) return 'The URL exists but refuses POST. It is almost certainly not a webhook endpoint — a page URL pasted by mistake, or a webhook URL that has since been replaced.'
  if (status === 401 || status === 403) return 'The destination rejected us as unauthorised. The webhook was probably revoked or regenerated at their end.'
  if (status === 410) return 'The destination reports this webhook as permanently gone. It needs replacing.'
  if (status === 429) return 'The destination is rate limiting us. Retries continue, but sustained 429s mean their limit is lower than the lead volume.'
  if (status >= 500) return 'The destination is erroring on its side. Often temporary — retries continue for 24 hours.'
  if (status >= 400) return `The destination rejected the payload with ${status}. Check the workflow at their end is still expecting this data.`
  return `Unexpected status ${status}.`
}

/** Every enabled destination with failed deliveries and no recent success. */
export async function getFailingDestinations(): Promise<FailingDestination[]> {
  const destinations = await prisma.webhookDestination
    .findMany({
      where: { enabled: true },
      select: {
        id: true,
        label: true,
        url: true,
        clientId: true,
        client: { select: { businessName: true } },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            status: true,
            responseStatus: true,
            lastError: true,
            lastAttemptAt: true,
          },
        },
      },
    })
    .catch(() => [])

  const failing: FailingDestination[] = []
  for (const dest of destinations) {
    if (dest.deliveries.length === 0) continue
    // A destination is "failing" only when its MOST RECENT delivery failed.
    // One failure followed by successes is history, not an incident, and
    // paging someone about history is how alerts get muted.
    const latest = dest.deliveries[0]
    if (latest.status !== 'FAILED') continue

    const failedCount = dest.deliveries.filter((d) => d.status === 'FAILED').length
    failing.push({
      destinationId: dest.id,
      label: dest.label,
      url: dest.url,
      clientId: dest.clientId,
      businessName: dest.client.businessName,
      failedCount,
      responseStatus: latest.responseStatus,
      lastError: latest.lastError,
      lastAttemptAt: latest.lastAttemptAt?.toISOString() ?? null,
      diagnosis: diagnose(latest.responseStatus, latest.lastError),
    })
  }
  return failing.sort((a, b) => b.failedCount - a.failedCount)
}

async function readAlertState(): Promise<Record<string, string>> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: ALERT_STATE_KEY } })
    if (!row?.value) return {}
    return JSON.parse(row.value) as Record<string, string>
  } catch {
    return {}
  }
}

async function writeAlertState(state: Record<string, string>): Promise<void> {
  const value = JSON.stringify(state)
  await prisma.setting
    .upsert({
      where: { key: ALERT_STATE_KEY },
      update: { value, encrypted: false },
      create: { key: ALERT_STATE_KEY, value, encrypted: false },
    })
    .catch(() => {})
}

/**
 * Failing destinations we have not already shouted about recently.
 *
 * Records the alert as sent before the email goes out, so a send that throws
 * halfway cannot loop. Missing one alert is better than sending sixty.
 */
export async function claimUnalerted(
  failing: FailingDestination[]
): Promise<FailingDestination[]> {
  if (failing.length === 0) return []
  const state = await readAlertState()
  const now = Date.now()
  const cutoff = now - REALERT_HOURS * 3_600_000

  const fresh = failing.filter((f) => {
    const last = state[f.destinationId]
    return !last || new Date(last).getTime() < cutoff
  })
  if (fresh.length === 0) return []

  const next: Record<string, string> = {}
  // Keep only destinations that are still failing, so the blob cannot grow
  // without bound as destinations come and go.
  for (const f of failing) next[f.destinationId] = state[f.destinationId] ?? new Date(now).toISOString()
  for (const f of fresh) next[f.destinationId] = new Date(now).toISOString()
  await writeAlertState(next)

  return fresh
}

/**
 * Email the operator that leads are not arriving.
 *
 * Sent to ADMIN_EMAIL through the same Resend account the client alerts use,
 * because the alternative is finding out from the client. Never throws — an
 * alert that breaks the cron would take the retries down with it, which is
 * strictly worse than a missed email.
 */
export async function emailDeliveryAlert(
  failing: FailingDestination[]
): Promise<{ sent: boolean; error?: string }> {
  if (failing.length === 0) return { sent: false }

  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  if (!to) return { sent: false, error: 'No ADMIN_EMAIL configured' }

  try {
    const { decrypt } = await import('@/lib/encryption')
    const setting = await prisma.setting.findUnique({ where: { key: 'RESEND_API_KEY' } })
    const apiKey = setting
      ? setting.encrypted
        ? decrypt(setting.value)
        : setting.value
      : process.env.RESEND_API_KEY
    if (!apiKey) return { sent: false, error: 'No Resend API key' }

    const fromSetting = await prisma.setting.findUnique({ where: { key: 'RESEND_FROM' } })
    const from = fromSetting?.value || process.env.RESEND_FROM || 'GlassLeads <leads@glassleads.app>'

    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const rows = failing
      .map(
        (f) => `<tr>
          <td style="padding:10px 12px;border-top:1px solid #e5e7eb">
            <strong>${esc(f.businessName)}</strong><br>
            <span style="color:#6b7280;font-size:13px">${esc(f.label)}</span><br>
            <span style="color:#b91c1c;font-size:13px">${f.responseStatus ?? 'no response'} · ${f.failedCount} undelivered</span><br>
            <span style="color:#374151;font-size:13px">${esc(f.diagnosis)}</span>
          </td>
        </tr>`
      )
      .join('')

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const sent = await resend.emails.send({
      from,
      to: [to],
      subject: `Leads are not reaching ${failing.length === 1 ? failing[0].businessName : `${failing.length} clients`}`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
    <div style="padding:20px 12px 4px">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c">Lead delivery failing</p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px">These leads were captured but could not be forwarded. Retries continue for 24 hours, then stop.</p>
    </div>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <div style="padding:16px 12px">
      <a href="https://glassleads.app/admin/dashboard" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;font-size:14px">Open the dashboard</a>
    </div>
  </div>
</div></body></html>`,
      text: [
        'Lead delivery failing. Captured but not forwarded:',
        ...failing.map(
          (f) => `- ${f.businessName} (${f.label}): ${f.responseStatus ?? 'no response'}, ${f.failedCount} undelivered. ${f.diagnosis}`
        ),
      ].join('\n'),
    })
    if (sent.error) return { sent: false, error: sent.error.message }
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Send failed' }
  }
}
