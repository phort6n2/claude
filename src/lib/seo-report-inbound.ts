import { Resend } from 'resend'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'
import { toBlobBody } from '@/lib/blob-body'
import { isVendorHost } from '@/lib/article-whitelabel'
import { readPdf } from '@/lib/seo-report-pdf'
import { parseSeoReport, type SeoReport } from '@/lib/seo-report'
import type { DigestSeo, MonthlyDigest } from '@/lib/monthly-digest'

/**
 * THE REPORTS INBOX: the SEO supplier's monthly PDF, arriving by email.
 *
 * The supplier will only send to the owner's own Gmail, so a Gmail filter
 * forwards each one to the app's Resend inbound address. Resend POSTs an
 * `email.received` event to `/api/webhooks/resend/inbound`; that event carries
 * only metadata, so this module fetches the email and its attachment through
 * Resend's API, keeps its own copy of the PDF, reads it (`seo-report.ts`),
 * matches the site to a shop and hands the figures to that month's report.
 *
 * WHO MAY SEND IS CHECKED, because what arrives here reaches a client. The
 * portal shows a month's report as soon as it is built — before anybody
 * presses Send — so an inbox that took a PDF from anyone would let anyone put
 * numbers in front of a shop. Accepted: the supplier's own domain (a Gmail
 * filter forward keeps the original From), or the owner's address for a
 * forward by hand. And the report has to name a site that belongs to a client
 * here, which no stranger's PDF will.
 *
 * NOTHING IS THROWN AWAY SILENTLY. Every email that arrives gets a row, and a
 * row that was not used says why — the wrong sender, no PDF, a site that
 * matches no shop, a section that could not be read, a supplier trace in the
 * file. "Did the report come in?" is then a question with an answer, where
 * "nothing appeared" would be indistinguishable from "nothing was sent".
 */

export const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com'
const MAX_PDF_BYTES = 15 * 1024 * 1024

/** "Name <addr@host>" → "addr@host", lowercased. */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

/**
 * May this sender's PDF go into a client's report?
 *
 * DMARC is read when Resend passes the header on: a message claiming the
 * supplier's domain that fails DMARC is a forgery. SPF is NOT read — a Gmail
 * forward legitimately fails SPF for the original domain, which is exactly the
 * path this inbox exists for; DKIM survives the forward and DMARC passes on it.
 */
export function senderAllowed(
  from: string,
  options: { ownerEmails: string[]; authResults?: string | null }
): { ok: true } | { ok: false; reason: string } {
  const address = addressOf(from)
  const domain = address.split('@')[1] || ''
  if (options.authResults && /\bdmarc=fail\b/i.test(options.authResults)) {
    return { ok: false, reason: `${address} failed DMARC, so it is not the sender it claims to be.` }
  }
  if (isVendorHost(domain)) return { ok: true }
  if (options.ownerEmails.map((e) => e.toLowerCase()).includes(address)) return { ok: true }
  return { ok: false, reason: `${address} is not the SEO supplier or an owner address, so it was not used.` }
}

/**
 * The site a report is about, when the PDF itself does not say: the subject
 * ("example.com — SEO report, August 2026", with any "Fwd:" in front) and then
 * the file name ("example.com-2026-08.pdf").
 */
export function siteAndMonthFromEmail(
  subject: string,
  filename: string | null
): { site: string | null; year: number | null; month: number | null } {
  const file = filename?.match(/^([a-z0-9.-]+\.[a-z]{2,})-(\d{4})-(\d{2})\.pdf$/i)
  const subj = subject.replace(/^((fwd?|fw):\s*)+/i, '').match(/^([a-z0-9.-]+\.[a-z]{2,})\s+[—–-]/i)
  return {
    site: (file?.[1] || subj?.[1] || '').toLowerCase().replace(/^www\./, '') || null,
    year: file ? Number(file[2]) : null,
    month: file ? Number(file[3]) : null,
  }
}

const bareHost = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * The ONE client whose website is this site: their own domain as recorded,
 * any custom domain pointed at the hosted site, or the hosted subdomain. Two
 * matches is no match — a report filed against the wrong shop is worse than
 * one waiting to be assigned.
 */
export async function matchClientBySite(
  site: string
): Promise<{ clientId: string; businessName: string } | { problem: string }> {
  const host = bareHost(site)
  if (!host) return { problem: `"${site}" is not a website address.` }
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
      siteSubdomain: true,
      domains: { select: { domain: true } },
    },
  })
  const hits = clients.filter(
    (c) =>
      bareHost(c.websiteUrl) === host ||
      c.domains.some((d) => bareHost(d.domain) === host) ||
      (c.siteSubdomain && `${c.siteSubdomain}.glassleads.app` === host)
  )
  if (hits.length === 1) return { clientId: hits[0].id, businessName: hits[0].businessName }
  if (hits.length > 1) {
    return { problem: `${host} matches ${hits.length} clients (${hits.map((h) => h.businessName).join(', ')}). Assign it by hand.` }
  }
  return { problem: `No client has ${host} as their website or a domain. Assign it by hand, or add the domain to the client.` }
}

/** The part of a read report that goes into our monthly report. */
export function seoSectionOf(parsed: SeoReport, receivedAt: Date): DigestSeo | null {
  if (!parsed.articles && !parsed.links && !parsed.ai) return null
  return {
    period: parsed.period,
    receivedAt: receivedAt.toISOString(),
    articles: parsed.articles,
    links: parsed.links,
    ai: parsed.ai,
    problems: parsed.problems,
  }
}

/**
 * READ AGAIN FROM THE STORED LINES, with today's rules. The parse stored at
 * intake is what the reader understood THEN; the first three real reports
 * were three layouts, and two of them met a rule written for the first
 * (Speedy's "Level since Jul" and its mixed-case keywords). Re-reading the
 * stored `readout` means a reader fix reaches every report already received
 * without anybody asking the supplier to send it again — which is why the
 * lines were kept. A report that now shows a supplier trace is dropped here,
 * the same hold as at intake. Sent monthly reports are untouched: they are a
 * stored snapshot and never read through this.
 */
function currentReading(row: { parsed: unknown; readout: unknown }): SeoReport {
  if (row.readout) {
    try {
      const again = parseSeoReport(row.readout as never)
      if (again.supplierTraces.length) return { ...again, articles: null, links: null, ai: null }
      return again
    } catch {
      /* A readout the current reader cannot handle falls back to what was
         stored, rather than costing the shop the section. */
    }
  }
  return row.parsed as unknown as SeoReport
}

/** The newest usable report for a shop and month, as a report section. */
export async function latestSeoSection(
  clientId: string,
  year: number,
  month: number
): Promise<DigestSeo | null> {
  const row = await prisma.seoReportEmail
    .findFirst({
      where: { clientId, year, month, problem: null, kind: 'report' },
      orderBy: { receivedAt: 'desc' },
      select: { parsed: true, readout: true, receivedAt: true },
    })
    .catch(() => null)
  if (!row?.parsed) return null
  return seoSectionOf(currentReading(row), row.receivedAt)
}

/**
 * The shop's NEWEST usable SEO report, whatever month it covers — for the
 * portal's always-on SEO card.
 *
 * THE OWNER'S DECISION, AND IT TRADES AWAY A REVIEW. Inside the monthly report
 * the figures wait for somebody to read them before the email goes; this card
 * shows them to the shop the moment the PDF is read. Accepted on purpose so
 * the work is visible when it lands rather than a month later. What still
 * stands between the PDF and the shop: the sender check, the one-client match,
 * the supplier-trace hold, and a parser that cannot invent a number.
 *
 * Newest by the MONTH it covers, then by arrival — a re-sent July report
 * arriving after August's must not replace August on the card.
 */
export async function latestSeoReport(
  clientId: string
): Promise<{ year: number; month: number; seo: DigestSeo } | null> {
  const row = await prisma.seoReportEmail
    .findFirst({
      where: { clientId, problem: null, kind: 'report', year: { not: null }, month: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { receivedAt: 'desc' }],
      select: { parsed: true, readout: true, receivedAt: true, year: true, month: true },
    })
    .catch(() => null)
  if (!row?.parsed || !row.year || !row.month) return null
  const seo = seoSectionOf(currentReading(row), row.receivedAt)
  return seo ? { year: row.year, month: row.month, seo } : null
}

/**
 * Put a newly arrived report into that month's stored report — ONLY if it has
 * not been sent. A sent report is a record of what the shop was told, and
 * changing it underneath them would make the portal disagree with their inbox
 * (the rule `monthly-report-run.ts` records). When no report is built yet,
 * nothing is needed: the build reads the inbox itself.
 */
export async function attachToMonthlyReport(
  clientId: string,
  year: number,
  month: number
): Promise<string> {
  const report = await prisma.clientMonthlyReport
    .findUnique({
      where: { clientId_year_month: { clientId, year, month } },
      select: { id: true, sentAt: true, payload: true },
    })
    .catch(() => null)
  if (!report) return 'no report built for that month yet — the build will pick it up'
  if (report.sentAt) return 'that month was already sent, so it was left as sent'
  const seo = await latestSeoSection(clientId, year, month)
  if (!seo) return 'nothing usable to attach'
  const payload = { ...(report.payload as unknown as MonthlyDigest), seo }
  await prisma.clientMonthlyReport.update({ where: { id: report.id }, data: { payload: payload as never } })
  return 'added to the unsent report'
}

async function ownerEmails(): Promise<string[]> {
  const configured = (await secretSetting('SEO_REPORT_SENDERS')) || ''
  return [process.env.ADMIN_EMAIL || '', ...configured.split(/[,\s]+/)]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))
}

export interface InboundResult {
  stored: number
  duplicate: boolean
  notes: string[]
}

/**
 * Handle one received email, by Resend's id. Idempotent: an email already
 * stored is reported as a duplicate, never stored twice.
 */
export async function processInboundEmail(emailId: string): Promise<InboundResult> {
  const notes: string[] = []
  const already = await prisma.seoReportEmail.findFirst({
    where: { inboundId: { startsWith: emailId } },
    select: { id: true },
  })
  if (already) return { stored: 0, duplicate: true, notes: ['already stored'] }

  const apiKey = await secretSetting('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY is not set, so the email cannot be fetched.')
  const resend = new Resend(apiKey)
  const { data: email, error } = await resend.emails.receiving.get(emailId)
  if (error || !email) {
    // A key restricted to sending cannot read received mail, and says so here.
    throw new Error(`Resend would not return the email: ${error?.message || 'no data'}`)
  }

  const from = email.from || ''
  const subject = email.subject || '(no subject)'
  const base = { sender: from.slice(0, 300), subject: subject.slice(0, 300) }

  const store = async (inboundId: string, data: Record<string, unknown>) => {
    try {
      await prisma.seoReportEmail.create({ data: { inboundId, ...base, ...data } as never })
      return true
    } catch (err) {
      // P2002: the same email arrived twice at once and the other copy won.
      if ((err as { code?: string }).code === 'P2002') return false
      throw err
    }
  }

  /* GMAIL'S CONFIRMATION. Setting up the forward makes Gmail send a code to
     this inbox, and nobody can read an inbox that only a webhook reads — so it
     is stored with the code pulled out, for the reports page to show. */
  if (addressOf(from) === GMAIL_FORWARDING_SENDER) {
    const text = email.text || ''
    const code = text.match(/Confirmation code:\s*(\d+)/i)?.[1]
    const link = text.match(/https:\/\/mail[^\s]*google\.com[^\s]*/i)?.[0]
    await store(emailId, {
      kind: 'gmail-confirmation',
      problem: [code ? `Confirmation code: ${code}` : null, link ? `Or open: ${link}` : null, !code && !link ? text.slice(0, 400) : null]
        .filter(Boolean)
        .join(' — '),
    })
    return { stored: 1, duplicate: false, notes: ['Gmail forwarding confirmation'] }
  }

  const allowed = senderAllowed(from, {
    ownerEmails: await ownerEmails(),
    authResults: email.headers?.['authentication-results'] ?? email.headers?.['Authentication-Results'] ?? null,
  })
  if (!allowed.ok) {
    await store(emailId, { kind: 'ignored', problem: allowed.reason })
    return { stored: 1, duplicate: false, notes: [allowed.reason] }
  }

  const pdfs = (email.attachments || []).filter(
    (a) => a.content_type === 'application/pdf' || /\.pdf$/i.test(a.filename || '')
  )
  if (pdfs.length === 0) {
    await store(emailId, { kind: 'ignored', problem: 'No PDF attached.' })
    return { stored: 1, duplicate: false, notes: ['no PDF'] }
  }

  let stored = 0
  for (const attachment of pdfs) {
    const inboundId = pdfs.length === 1 ? emailId : `${emailId}:${attachment.id}`
    const fallback = siteAndMonthFromEmail(subject, attachment.filename)
    const row: Record<string, unknown> = { kind: 'report', site: fallback.site, year: fallback.year, month: fallback.month }
    try {
      if (attachment.size > MAX_PDF_BYTES) throw new Error(`The PDF is ${Math.round(attachment.size / 1e6)} MB, over the limit.`)
      const { data: file, error: fileError } = await resend.emails.receiving.attachments.get({
        emailId,
        id: attachment.id,
      })
      if (fileError || !file?.download_url) throw new Error(`Resend would not give the attachment: ${fileError?.message || 'no link'}`)
      const res = await fetch(file.download_url)
      if (!res.ok) throw new Error(`Downloading the PDF answered HTTP ${res.status}.`)
      const bytes = new Uint8Array(await res.arrayBuffer())

      // OUR copy: the download link expires, and the operator may want the
      // original. A copy that fails costs the copy, never the report — the
      // same rule the SMS inbox keeps for photos; the figures are read from
      // the bytes already in hand, and the lines are stored below regardless.
      try {
        const blob = await put(`seo-reports/report.pdf`, toBlobBody(bytes), {
          access: 'public',
          contentType: 'application/pdf',
          addRandomSuffix: true,
        })
        row.pdfUrl = blob.url
      } catch (err) {
        console.warn('[Reports inbox] could not keep a copy of the PDF:', err instanceof Error ? err.message : err)
      }

      const readout = await readPdf(bytes)
      row.readout = { pages: readout.pages, columns: readout.columns, info: readout.info, links: readout.links }
      const parsed = parseSeoReport(readout)
      row.parsed = parsed
      row.site = parsed.site || fallback.site
      row.year = parsed.year ?? fallback.year
      row.month = parsed.month ?? fallback.month

      if (parsed.supplierTraces.length) {
        row.problem = `Held back: the file names the supplier (${parsed.supplierTraces.slice(0, 2).join('; ')}).`
      } else if (!row.site) {
        row.problem = 'Could not tell which website the report is about.'
      } else if (!row.year || !row.month) {
        row.problem = 'Could not tell which month the report covers.'
      } else if (!parsed.articles && !parsed.links && !parsed.ai) {
        row.problem = `Nothing in it could be read${parsed.problems.length ? `: ${parsed.problems.join(' ')}` : ' — the layout may have changed.'}`
      }
      const match = row.site ? await matchClientBySite(String(row.site)) : null
      if (match && 'clientId' in match) row.clientId = match.clientId
      else if (match && !row.problem) row.problem = match.problem
    } catch (err) {
      row.problem = err instanceof Error ? err.message : 'Could not read the PDF.'
    }

    if (await store(inboundId, row)) stored++
    if (!row.problem && row.clientId && row.year && row.month) {
      notes.push(await attachToMonthlyReport(String(row.clientId), Number(row.year), Number(row.month)))
    } else if (row.problem) {
      notes.push(String(row.problem))
    }
  }
  return { stored, duplicate: stored === 0, notes }
}
