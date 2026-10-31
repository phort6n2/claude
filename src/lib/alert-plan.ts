/**
 * Who a lead alert goes to, and — when the answer is nobody — WHY.
 * Import-free, so scripts/check-alert-log.ts can run it.
 *
 * Split out of `notifyNewLead` because that function used to return an empty
 * result for five different reasons and say none of them: no settings row,
 * email switched off, call emails switched off, no addresses, and the SMS
 * add-on not on. MAG Mobile wrote "we didn't get notified" about a call and a
 * couple of missed calls, and nothing anywhere could say which of those it
 * was — the alert result was thrown away by the call path, and Vercel's log
 * of the call was gone after a day. The reason is now computed here, once,
 * and stored on the lead with the outcome (lead-alert-log.ts).
 */

export interface AlertSettings {
  emailEnabled: boolean
  emailTo: string[]
  emailCallLeads: boolean
  smsEnabled: boolean
  smsTo: string[]
}

export interface AlertPlan {
  emails: string[]
  numbers: string[]
  /** Why there is no email, when there is none. */
  noEmail: string | null
  /** Why there is no text, when there is none. */
  noSms: string | null
}

export function alertPlan(
  settings: AlertSettings | null,
  lead: { isCall?: boolean },
  kind: 'urgent' | 'record'
): AlertPlan {
  if (!settings) {
    const why = 'no alert settings saved for this client (Lead delivery tab)'
    return { emails: [], numbers: [], noEmail: why, noSms: why }
  }
  const addresses = settings.emailTo.map((e) => e.trim()).filter(Boolean)
  const phones = settings.smsTo.map((n) => n.trim()).filter(Boolean)

  // A text-to-the-tracking-number "call" counts as a call here, as it always
  // has (sms-lead.ts passes isCall) — the call-email switch covers both.
  const noEmail = !settings.emailEnabled
    ? 'email alerts are switched off'
    : lead.isCall && !settings.emailCallLeads
      ? 'email alerts for calls and texts are switched off'
      : addresses.length === 0
        ? 'no email address is set'
        : null
  const noSms =
    kind === 'record'
      ? 'an answered call is a record, not an interruption — email only, by design'
      : !settings.smsEnabled
        ? 'the SMS add-on is not switched on'
        : phones.length === 0
          ? 'no number is set for texts'
          : null

  return {
    emails: noEmail ? [] : addresses,
    numbers: noSms ? [] : phones,
    noEmail,
    noSms,
  }
}

/** One entry of `Lead.alertLog` — written by lead-alert-log.ts, read by the lead page. */
export interface AlertLogEntry {
  at: string
  /** What triggered it. */
  via: 'call' | 'text' | 'form'
  /** urgent = email + text + push; record = email only (an answered call). */
  kind: 'urgent' | 'record'
  emailTo: string[]
  emailSent: number
  smsTo: string[]
  smsSent: number
  /** Devices of the shop's portal users, when a push was part of it. */
  pushShop?: { sent: number; failed: number } | null
  errors: string[]
  noEmail?: string | null
  noSms?: string | null
  /** Set when nothing was sent on purpose: a same-day repeat, say. */
  skipped?: string | null
}

/** One line a person can read, for the log and the lead page. */
export function describeAlert(e: AlertLogEntry): string {
  if (e.skipped) return `Not alerted — ${e.skipped}`
  const parts: string[] = []
  parts.push(
    e.emailSent ? `emailed ${e.emailTo.join(', ')}` : e.noEmail ? `no email (${e.noEmail})` : 'email not sent'
  )
  parts.push(e.smsSent ? `texted ${e.smsTo.join(', ')}` : e.noSms ? `no text (${e.noSms})` : 'text not sent')
  if (e.pushShop) {
    parts.push(
      e.pushShop.sent
        ? `pushed to ${e.pushShop.sent} shop device${e.pushShop.sent === 1 ? '' : 's'}`
        : 'no shop device has alerts switched on'
    )
  }
  return parts.join('; ')
}
