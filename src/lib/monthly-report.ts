import { prisma } from '@/lib/db'

/**
 * Leads → booked → revenue, by month.
 *
 * The retention artifact. A shop paying $497 a month cancels not because the
 * work stopped but because nobody ever put the result in front of them in a
 * form they could read in thirty seconds. The Activity feed answers "what are
 * you doing"; this answers "what did I get".
 *
 * EVERY FIGURE COMES FROM THE SHOP'S OWN BOOKKEEPING. Booked counts and
 * revenue are whatever they marked in the portal or tapped in a lead alert —
 * we do not estimate, model or gross anything up. That has two consequences
 * worth stating plainly on the page rather than hiding:
 *
 * - A shop that does not mark leads booked shows a booked count of zero. That
 *   reads as bad news and is really missing data, so the page says which it
 *   is rather than letting a blank column argue against the service.
 * - Revenue is only what they typed. A shop that marks jobs booked but never
 *   enters a value gets a booked count and no money, which is honest.
 *
 * NOT sent anywhere. Building the numbers and mailing them to fifteen real
 * business owners are different decisions, and the second one is the owner's.
 */

export interface ReportMonth {
  /** First of the month, for keying and sorting. */
  month: Date
  label: string
  leads: number
  booked: number
  lost: number
  /** Still open — neither booked nor written off. */
  open: number
  /** Sum of what the shop entered against booked jobs. */
  revenue: number
  /** Booked as a share of leads, or null when nothing has been marked. */
  bookedRate: number | null
  /** Revenue per lead delivered. The number that argues for the retainer. */
  valuePerLead: number | null
  /** Calls answered through a tracking number, when call tracking is on. */
  calls: number
}

export interface MonthlyReport {
  months: ReportMonth[]
  totals: {
    leads: number
    booked: number
    revenue: number
    bookedRate: number | null
    valuePerLead: number | null
  }
  /** True when the shop has never marked a single lead booked. */
  nothingMarked: boolean
  /** Leads whose outcome is still unrecorded — the caveat on every figure. */
  unmarked: number
}

const MONEY = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function formatMoney(n: number): string {
  return MONEY(n)
}

export async function getMonthlyReport(
  clientId: string,
  monthsBack = 12
): Promise<MonthlyReport> {
  const start = new Date()
  start.setMonth(start.getMonth() - (monthsBack - 1))
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  const [leads, calls] = await Promise.all([
    prisma.lead
      .findMany({
        // Duplicates excluded — a second submission from the same person on
        // the same day is not a second job anybody can book.
        where: { clientId, duplicateOfLeadId: null, createdAt: { gte: start } },
        select: { createdAt: true, status: true, saleValue: true },
      })
      .catch(() => []),
    prisma.callAnalysis
      .findMany({
        where: { clientId, createdAt: { gte: start } },
        select: { createdAt: true },
      })
      .catch(() => []),
  ])

  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
  const buckets = new Map<string, ReportMonth>()

  // Every month in the window exists, including the empty ones. A month that
  // vanishes because nothing happened makes a quiet month invisible instead of
  // visible, and a quiet month is the one worth talking about.
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start)
    d.setMonth(start.getMonth() + i)
    buckets.set(key(d), {
      month: d,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      leads: 0,
      booked: 0,
      lost: 0,
      open: 0,
      revenue: 0,
      bookedRate: null,
      valuePerLead: null,
      calls: 0,
    })
  }

  let unmarked = 0
  for (const lead of leads) {
    const bucket = buckets.get(key(lead.createdAt))
    if (!bucket) continue
    bucket.leads++
    if (lead.status === 'SOLD') {
      bucket.booked++
      bucket.revenue += lead.saleValue || 0
    } else if (lead.status === 'LOST') {
      bucket.lost++
    } else {
      bucket.open++
      unmarked++
    }
  }
  for (const call of calls) {
    const bucket = buckets.get(key(call.createdAt))
    if (bucket) bucket.calls++
  }

  const months = [...buckets.values()].sort((a, b) => b.month.getTime() - a.month.getTime())
  for (const m of months) {
    m.bookedRate = m.leads > 0 ? m.booked / m.leads : null
    m.valuePerLead = m.leads > 0 && m.revenue > 0 ? m.revenue / m.leads : null
  }

  const totalLeads = months.reduce((s, m) => s + m.leads, 0)
  const totalBooked = months.reduce((s, m) => s + m.booked, 0)
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0)

  return {
    months,
    totals: {
      leads: totalLeads,
      booked: totalBooked,
      revenue: totalRevenue,
      bookedRate: totalLeads > 0 ? totalBooked / totalLeads : null,
      valuePerLead: totalLeads > 0 && totalRevenue > 0 ? totalRevenue / totalLeads : null,
    },
    nothingMarked: totalBooked === 0,
    unmarked,
  }
}
