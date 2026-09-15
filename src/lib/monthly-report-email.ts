import { prisma } from '@/lib/db'
import { monthLabel } from '@/lib/tz'
import type { MonthlyDigest } from '@/lib/monthly-digest'

/**
 * The monthly report, as an email.
 *
 * WHO IT GOES TO: the portal login addresses, and nothing else. Same rule the
 * lead alerts follow — recipients are only what is actually on the client,
 * with no fallback to `Client.email` and no operator address from the
 * environment — but a DIFFERENT list, and deliberately. `ClientNotification.
 * emailTo` is whoever needs waking when a lead lands, which on several clients
 * is a technician. A month's spend and revenue is for whoever owns the
 * business, and the portal invite went to the address that has proven it
 * reaches one.
 *
 * A client with no portal user sends NOTHING and says so. The report is on the
 * portal either way, so the email is the nudge rather than the artifact.
 *
 * EVERY SECTION STRIPS ITSELF when it has no data, per § 2. A self-serve shop
 * has no ads account, so their report is enquiries and work done — that is the
 * right report for them, not a broken version of somebody else's. What does
 * NOT strip is a section that failed: an ads block missing because the API was
 * down says so, because "we spent nothing on your ads" is a different claim
 * from "we could not read your account this morning".
 */

async function secret(key: string): Promise<string | null> {
  try {
    const { secretSetting } = await import('@/lib/secret-settings')
    return (await secretSetting(key)) || process.env[key] || null
  } catch {
    return process.env[key] || null
  }
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Two decimals, because a cost per conversion of "$43" hides the pennies. */
const money2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const num = (n: number) => n.toLocaleString('en-US')

function portalUrl(path = '/portal/results'): string {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://glassleads.app'
  return `${base}${path}`
}

function shell(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">${inner}</div>
</body></html>`
}

const H2 = 'margin:28px 0 10px;font-size:15px;font-weight:700;letter-spacing:.02em;color:#111827'
const P = 'margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151'
const TD = 'padding:7px 10px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#374151'
const TH =
  'padding:7px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:left'

/** A figure and its label, as a row of boxes that survives an email client. */
function stats(items: Array<{ label: string; value: string }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>${items
    .map(
      (item) => `<td style="padding:10px 12px;background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;width:${Math.floor(
        100 / items.length
      )}%;vertical-align:top">
        <div style="font-size:20px;font-weight:800;color:#111827;line-height:1.2">${esc(item.value)}</div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-top:3px">${esc(item.label)}</div>
      </td>`
    )
    .join('<td style="width:8px"></td>')}</tr></table>`
}

/**
 * The digest as HTML and as text.
 *
 * Pure: a digest in, two strings out. Nothing fetched, so the body can be
 * checked against a saved digest without a provider, a database or a month
 * having passed — which is the only way the copy gets read before a shop
 * reads it.
 */
export function renderMonthlyReportEmail(
  digest: MonthlyDigest,
  note: string | null
): { subject: string; html: string; text: string } {
  const e = digest.enquiries
  const parts: string[] = []
  const lines: string[] = []

  parts.push(
    `<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">${esc(
      digest.label
    )}</p>
     <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#111827">${esc(
       digest.businessName
     )} — last month</h1>`
  )
  lines.push(`${digest.businessName} — ${digest.label}`, '')

  // --- Enquiries -----------------------------------------------------------
  parts.push(`<h2 style="${H2}">Enquiries</h2>`)
  parts.push(
    stats([
      { label: 'Total enquiries', value: num(e.total) },
      { label: 'Calls', value: num(e.byChannel.phone) },
      { label: 'Form', value: num(e.byChannel.form) },
      ...(e.byChannel.sms ? [{ label: 'Texts', value: num(e.byChannel.sms) }] : []),
    ])
  )
  lines.push(
    `ENQUIRIES: ${e.total} total — ${e.byChannel.phone} calls, ${e.byChannel.form} form${
      e.byChannel.sms ? `, ${e.byChannel.sms} text` : ''
    }`
  )

  /* THE BOOKED FIGURE CARRIES ITS OWN CAVEAT, because a zero here almost
     always means nobody ticked the box rather than nobody bought — and read
     without that sentence it is an argument against the service, made by us,
     in our own report. The same rule monthly-report.ts already follows on the
     portal page. */
  if (e.booked > 0) {
    parts.push(
      `<p style="${P}"><strong>${num(e.booked)} marked booked${
        e.revenue > 0 ? `, ${money(e.revenue)} in work` : ''
      }.</strong>${
        e.open > 0
          ? ` ${num(e.open)} still open — those are the ones worth a second call.`
          : ''
      }</p>`
    )
    lines.push(
      `Booked: ${e.booked}${e.revenue > 0 ? ` (${money(e.revenue)})` : ''}${
        e.open > 0 ? `; ${e.open} still open` : ''
      }`
    )
  } else if (e.total > 0) {
    parts.push(
      `<p style="${P}">None of these are marked booked yet, so there is no revenue figure this
       month. Marking them in the portal is what turns this into a report you can hold the
       spend against.</p>`
    )
    lines.push('None marked booked yet — no revenue figure this month.')
  } else {
    parts.push(`<p style="${P}">No enquiries came in last month.</p>`)
    lines.push('No enquiries last month.')
  }

  // --- Ads -----------------------------------------------------------------
  if (digest.ads) {
    const a = digest.ads
    parts.push(`<h2 style="${H2}">Google Ads</h2>`)
    parts.push(
      stats([
        { label: 'Spend', value: money(a.spend) },
        { label: 'Clicks', value: num(a.clicks) },
        { label: 'Conversions', value: num(Math.round(a.conversions * 10) / 10) },
        {
          label: 'Cost / conversion',
          value: a.costPerConversion === null ? '—' : money2(a.costPerConversion),
        },
      ])
    )
    /* SAID OUT LOUD: these are Google's numbers, not ours. They will not match
       the enquiry count above — Google counts only what it can attribute to an
       ad click, so an organic or direct enquiry is absent from it. A shop who
       spots the difference and is not told why concludes one of the two is
       made up. */
    parts.push(
      `<p style="${P}">Spend and conversions are Google&rsquo;s own figures for the month, so they
       match what you see in your Ads account. They count only the enquiries Google can tie back
       to an ad click, which is why the conversion count is lower than the total above.</p>`
    )
    lines.push(
      '',
      `GOOGLE ADS: ${money(a.spend)} spend, ${a.clicks} clicks, ${
        Math.round(a.conversions * 10) / 10
      } conversions, ${a.costPerConversion === null ? 'no' : money2(a.costPerConversion)} per conversion`
    )

    if (a.campaigns.length) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;border-collapse:collapse">
          <tr><th style="${TH}">Campaign</th><th style="${TH}">Spend</th><th style="${TH}">Clicks</th><th style="${TH}">Conv.</th></tr>
          ${a.campaigns
            .map(
              (c) =>
                `<tr><td style="${TD}">${esc(c.name)}</td><td style="${TD}">${money(
                  c.spend
                )}</td><td style="${TD}">${num(c.clicks)}</td><td style="${TD}">${
                  Math.round(c.conversions * 10) / 10
                }</td></tr>`
            )
            .join('')}
        </table>`
      )
      for (const c of a.campaigns) {
        lines.push(`  ${c.name}: ${money(c.spend)}, ${c.clicks} clicks, ${c.conversions} conv.`)
      }
    }

    if (a.keywords.length) {
      parts.push(`<h2 style="${H2}">Where the money went</h2>`)
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;border-collapse:collapse">
          <tr><th style="${TH}">Search term matched</th><th style="${TH}">Spend</th><th style="${TH}">Clicks</th><th style="${TH}">Conv.</th></tr>
          ${a.keywords
            .slice(0, 10)
            .map(
              (k) =>
                `<tr><td style="${TD}">${esc(k.text)}</td><td style="${TD}">${money(
                  k.spend
                )}</td><td style="${TD}">${num(k.clicks)}</td><td style="${TD}">${
                  Math.round(k.conversions * 10) / 10
                }</td></tr>`
            )
            .join('')}
        </table>`
      )
      lines.push('', 'TOP KEYWORDS BY SPEND:')
      for (const k of a.keywords.slice(0, 10)) {
        lines.push(`  ${k.text}: ${money(k.spend)}, ${k.clicks} clicks, ${k.conversions} conv.`)
      }
    }
  } else if (digest.adsError) {
    // A failure, not an absence. See the note at the top of the file.
    parts.push(`<h2 style="${H2}">Google Ads</h2>`)
    parts.push(
      `<p style="${P}">We could not read your Ads account when this report was built, so the spend
       figures are missing rather than zero. We are looking at it.</p>`
    )
    lines.push('', 'GOOGLE ADS: could not be read when this report was built.')
  }

  // --- Work completed ------------------------------------------------------
  if (digest.work.length) {
    parts.push(`<h2 style="${H2}">What we did</h2>`)
    parts.push(
      `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.65;color:#374151">
        ${digest.work
          .slice(0, 12)
          .map(
            (w) =>
              `<li style="margin-bottom:5px">${esc(w.title)}${
                w.detail ? `<br><span style="color:#6b7280;font-size:13px">${esc(w.detail)}</span>` : ''
              }</li>`
          )
          .join('')}
      </ul>`
    )
    lines.push('', 'WHAT WE DID:')
    for (const w of digest.work.slice(0, 12)) lines.push(`  - ${w.title}`)
  }

  // --- Next steps ----------------------------------------------------------
  /* THE OPERATOR'S NOTE FIRST, then the findings the sweeps already filed.
     Nothing here is written by a model: monthly advice invented for a real
     business owner is § 2's fabricated fact, and the daily and weekly checks
     already produce structured claims with their evidence attached. */
  if (note?.trim() || digest.nextSteps.length) {
    parts.push(`<h2 style="${H2}">What&rsquo;s next</h2>`)
    if (note?.trim()) {
      parts.push(
        `<p style="${P}">${esc(note.trim()).replace(/\n+/g, '</p><p style="' + P + '">')}</p>`
      )
      lines.push('', "WHAT'S NEXT:", note.trim())
    }
    if (digest.nextSteps.length) {
      parts.push(
        `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.65;color:#374151">
          ${digest.nextSteps
            .map(
              (s) =>
                `<li style="margin-bottom:5px"><strong>${esc(s.title)}</strong><br><span style="color:#6b7280;font-size:13px">${esc(
                  s.detail
                )}</span></li>`
            )
            .join('')}
        </ul>`
      )
      if (!note?.trim()) lines.push('', "WHAT'S NEXT:")
      for (const s of digest.nextSteps) lines.push(`  - ${s.title}: ${s.detail}`)
    }
  }

  parts.push(
    `<p style="margin:24px 0 0"><a href="${portalUrl()}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px">See the full report</a></p>
     <p style="margin:14px 0 0;font-size:12px;color:#9ca3af">Every figure here is from your own
     account and your own leads. Nothing is estimated.</p>`
  )
  lines.push('', `See the full report: ${portalUrl()}`, '', 'Nothing in this report is estimated.')

  return {
    subject: `${digest.businessName} — ${digest.label} report`,
    html: shell(parts.join('\n')),
    text: lines.join('\n'),
  }
}

/** Every portal login for this client — the report's recipient list. */
export async function reportRecipients(clientId: string): Promise<string[]> {
  const users = await prisma.clientUser
    .findMany({ where: { clientId }, select: { email: true } })
    .catch(() => [])
  return users.map((u) => u.email).filter(Boolean)
}

/**
 * Send a stored report. Stamps `sentAt`/`sentTo` only when a provider
 * accepted it — "sent, go check your inbox" about a message that never left
 * is what teaches a shop to distrust everything else on the screen, which is
 * the rule `test-alert.ts` already follows.
 */
export async function sendMonthlyReport(
  reportId: string
): Promise<{ ok: boolean; sentTo?: string[]; error?: string }> {
  const report = await prisma.clientMonthlyReport.findUnique({
    where: { id: reportId },
    select: { id: true, clientId: true, payload: true, note: true, year: true, month: true },
  })
  if (!report) return { ok: false, error: 'Report not found' }

  const recipients = await reportRecipients(report.clientId)
  if (recipients.length === 0) {
    return {
      ok: false,
      error:
        'No portal login for this client, so there is nobody to send it to. Send the portal invite from the Overview tab first.',
    }
  }

  const digest = report.payload as unknown as MonthlyDigest
  if (!digest?.businessName) {
    return { ok: false, error: 'The stored report is unreadable — rebuild it before sending.' }
  }
  const { subject, html, text } = renderMonthlyReportEmail(digest, report.note)

  const apiKey = await secret('RESEND_API_KEY')
  if (!apiKey) {
    const error = 'RESEND_API_KEY is not configured'
    await prisma.clientMonthlyReport
      .update({ where: { id: report.id }, data: { sendError: error } })
      .catch(() => {})
    return { ok: false, error }
  }
  const configured = (await secret('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
  const address = /<([^>]+)>/.exec(configured)?.[1] || configured

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    // The same address the lead alerts and the portal invite come from: the
    // welcome email asked them to whitelist it, and every message that
    // arrives from it is the whitelist paying off.
    const sent = await resend.emails.send({
      from: `Auto Glass Marketing Pros <${address}>`,
      to: recipients,
      subject,
      html,
      text,
    })
    if (sent.error) {
      await prisma.clientMonthlyReport
        .update({ where: { id: report.id }, data: { sendError: sent.error.message } })
        .catch(() => {})
      return { ok: false, error: sent.error.message }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send failed'
    await prisma.clientMonthlyReport
      .update({ where: { id: report.id }, data: { sendError: message } })
      .catch(() => {})
    return { ok: false, error: message }
  }

  await prisma.clientMonthlyReport.update({
    where: { id: report.id },
    data: { sentAt: new Date(), sentTo: recipients, sendError: null },
  })
  console.log(
    `[MonthlyReport] sent ${monthLabel(report.year, report.month)} for ${digest.businessName} to ${recipients.join(', ')}`
  )
  return { ok: true, sentTo: recipients }
}
