import { prisma } from '@/lib/db'
import { buildMonthlyDigest } from '@/lib/monthly-digest'
import { LIVE_STATUSES } from '@/lib/site-preview'
import { monthLabel, previousMonthOf } from '@/lib/tz'

/**
 * Build last month's report for every live client. BUILDS ONLY — never sends.
 *
 * THE SPLIT IS THE POINT. The cron produces the numbers on the 1st and stops;
 * a person reads them and presses send. An email to fifteen real business
 * owners cannot be unsent, and the figure most likely to be wrong is the one
 * in the first report a client ever gets — a cost per conversion flattered by
 * an account still counting phone calls twice, a spend of $0 because the API
 * was down, a booked count of zero because nobody ticked the box. Each of
 * those is obvious to a human in two seconds and invisible to this function.
 *
 * REBUILDING IS SAFE AND DOES NOT RESEND. A report already sent is never
 * rebuilt: the shop has the email, so the stored payload is now a record of
 * what they were told rather than a view of the month, and silently changing
 * it underneath them would make the portal disagree with their inbox. An
 * unsent one is replaced, because the only reason to run this again is that
 * the first attempt was missing something.
 */

export interface MonthlyRunResult {
  ok: boolean
  built: number
  rebuilt: number
  skipped: number
  failed: number
  results: Array<Record<string, unknown>>
  message: string
}

/** Stop before the platform does, and name who was not reached. */
const TIME_BUDGET_MS = 240_000

export async function buildMonthlyReports(options?: {
  /** Override the month, for a backfill or a re-run. Defaults to last month. */
  year?: number
  month?: number
  /** One client only. */
  clientId?: string
}): Promise<MonthlyRunResult> {
  const clients = await prisma.client.findMany({
    where: {
      status: { in: [...LIVE_STATUSES] },
      ...(options?.clientId ? { id: options.clientId } : {}),
    },
    select: { id: true, businessName: true, timezone: true },
    orderBy: { businessName: 'asc' },
  })

  const started = Date.now()
  const results: Array<Record<string, unknown>> = []
  let built = 0
  let rebuilt = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      results.push({ client: client.businessName, error: 'not reached — run it again' })
      failed++
      continue
    }

    /* EACH CLIENT'S OWN CALENDAR. A shop in Los Angeles and one in New York
       do not finish February at the same instant, and asking the server what
       month it is answers for neither of them. See lib/tz.ts — at 00:00 UTC
       on the 1st the answer is the month before last for every US client. */
    const period = options?.year && options?.month
      ? { year: options.year, month: options.month }
      : previousMonthOf(new Date(), client.timezone || 'America/Denver')

    const existing = await prisma.clientMonthlyReport
      .findUnique({
        where: {
          clientId_year_month: { clientId: client.id, year: period.year, month: period.month },
        },
        select: { id: true, sentAt: true },
      })
      .catch(() => null)

    if (existing?.sentAt) {
      results.push({
        client: client.businessName,
        month: monthLabel(period.year, period.month),
        skipped: 'already sent — the stored copy is what the shop was told',
      })
      skipped++
      continue
    }

    const result = await buildMonthlyDigest(client.id, period.year, period.month)
    if (!result.ok) {
      results.push({ client: client.businessName, error: result.error })
      failed++
      continue
    }

    try {
      if (existing) {
        await prisma.clientMonthlyReport.update({
          where: { id: existing.id },
          // The note is the operator's and survives a rebuild; only the
          // numbers are replaced.
          data: { payload: result.digest as never, builtAt: new Date(), sendError: null },
        })
        rebuilt++
      } else {
        await prisma.clientMonthlyReport.create({
          data: {
            clientId: client.id,
            year: period.year,
            month: period.month,
            payload: result.digest as never,
          },
        })
        built++
      }
    } catch (error) {
      results.push({
        client: client.businessName,
        error:
          error instanceof Error
            ? error.message
            : 'Could not store — if this is a fresh deploy, run /api/admin/setup-db',
      })
      failed++
      continue
    }

    const digest = result.digest
    results.push({
      client: client.businessName,
      month: digest.label,
      enquiries: digest.enquiries.total,
      booked: digest.enquiries.booked,
      spend: digest.ads?.spend ?? null,
      costPerConversion: digest.ads?.costPerConversion ?? null,
      work: digest.work.length,
      // Named, not counted: a missing ads section during an outage would
      // otherwise read as a month with no spend.
      ...(digest.adsError ? { adsProblem: digest.adsError } : {}),
      ...(digest.ads === null && !digest.adsError ? { ads: 'not ads-managed' } : {}),
    })
  }

  return {
    ok: true,
    built,
    rebuilt,
    skipped,
    failed,
    results,
    message:
      [
        built ? `Built ${built}` : '',
        rebuilt ? `rebuilt ${rebuilt}` : '',
        skipped ? `${skipped} already sent` : '',
        failed ? `${failed} failed` : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'Nothing to build',
  }
}
