import { prisma } from '@/lib/db'
import type { NotifyResult } from '@/lib/lead-notifications'
import { describeAlert, type AlertLogEntry } from '@/lib/alert-plan'

export { describeAlert, type AlertLogEntry }

/**
 * WHAT A LEAD'S ALERT ACTUALLY DID, stored on the lead (`Lead.alertLog`,
 * bootstrap: ALERT_LOG_SQL) and shown on the admin lead page.
 *
 * MAG Mobile wrote "we didn't get notified" about their last call and a couple
 * of missed calls, and the question could not be answered: the call path
 * threw `notifyNewLead`'s result away, so a refused text or a Resend error was
 * logged nowhere, and Vercel's own log of the call was gone after a day. The
 * complaint arrives days later; the evidence has to outlive the log. So every
 * alert — sent, skipped as a same-day repeat, or sent to nobody — writes one
 * entry here: who it went to, what each channel did, and when a channel sent
 * nothing, the reason (alert-plan.ts).
 *
 * NEVER THROWS and never blocks the alert: it runs after the send, and a lead
 * with an alert and no entry is the state this replaces, not a new failure.
 */

/** The most recent entries are what matter; the cap keeps a busy lead's row small. */
const MAX_ENTRIES = 20

export function alertEntry(
  via: AlertLogEntry['via'],
  kind: AlertLogEntry['kind'],
  result: NotifyResult | null,
  extra: Partial<Pick<AlertLogEntry, 'pushShop' | 'skipped'>> = {}
): AlertLogEntry {
  return {
    at: new Date().toISOString(),
    via,
    kind,
    emailTo: result?.emailTo ?? [],
    emailSent: result?.emailSent ?? 0,
    smsTo: result?.smsTo ?? [],
    smsSent: result?.smsSent ?? 0,
    pushShop: extra.pushShop ?? null,
    errors: result?.errors ?? [],
    noEmail: result?.noEmail ?? null,
    noSms: result?.noSms ?? null,
    skipped: extra.skipped ?? null,
  }
}

export async function recordAlert(leadId: string, entry: AlertLogEntry): Promise<void> {
  console.log(
    `[Alert] lead ${leadId} ${entry.via}/${entry.kind}: ${describeAlert(entry)}${
      entry.errors.length ? ` — ERRORS: ${entry.errors.join(' | ')}` : ''
    }`
  )
  try {
    const row = await prisma.lead.findUnique({ where: { id: leadId }, select: { alertLog: true } })
    const prior = Array.isArray(row?.alertLog) ? (row!.alertLog as unknown as AlertLogEntry[]) : []
    await prisma.lead.update({
      where: { id: leadId },
      data: { alertLog: [...prior, entry].slice(-MAX_ENTRIES) as never },
    })
  } catch (error) {
    console.error(`[Alert] could not store the alert record on lead ${leadId}:`, error)
  }
}
