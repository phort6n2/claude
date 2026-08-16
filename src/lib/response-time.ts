import { prisma } from '@/lib/db'

/**
 * How long a shop takes to touch a lead.
 *
 * This is the answer when a client says the leads are bad. A shop that opens
 * its enquiries the next morning is not being sent worse leads than one that
 * calls within ten minutes; it is converting the same leads worse, and that
 * conversation goes nowhere without a number on it.
 *
 * MEDIAN, NOT MEAN. One lead touched five days late drags an average into
 * uselessness while the typical response was twenty minutes. The mean is
 * reported alongside precisely so the gap between them is visible — a large
 * gap IS the finding, because it says the shop is fine most of the time and
 * drops some entirely.
 *
 * Measured from `Lead.firstTouchedAt`, not `statusUpdatedAt`: the latter holds
 * the LATEST change, so on a lead that went NEW → CONTACTED → SOLD it reports
 * how long the job took rather than how long the customer waited.
 *
 * Leads that predate the column are excluded and COUNTED as excluded. A metric
 * that quietly drops what it cannot measure is a metric that reads as complete
 * when it is not.
 */

export interface ResponseTimeStats {
  /** Leads created in the window, excluding duplicates. */
  total: number
  /** Touched, and measurable — the basis of every figure below. */
  measured: number
  /** Touched before the column existed, so not measurable. */
  unmeasurable: number
  /** Still sitting on NEW. */
  untouched: number
  medianMinutes: number | null
  meanMinutes: number | null
  /** Touched inside fifteen minutes — the band that actually wins jobs. */
  withinFifteenMin: number
  /** Left more than a working day. */
  overOneDay: number
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`
  return `${(hours / 24).toFixed(1)} days`
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export async function getResponseTime(
  clientId: string,
  days = 90
): Promise<ResponseTimeStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const leads = await prisma.lead
    .findMany({
      // Duplicates excluded: a second submission from the same person on the
      // same day is not a second lead anybody has to answer.
      where: { clientId, duplicateOfLeadId: null, createdAt: { gte: since } },
      select: { createdAt: true, status: true, firstTouchedAt: true },
    })
    .catch(() => [])

  const stats: ResponseTimeStats = {
    total: leads.length,
    measured: 0,
    unmeasurable: 0,
    untouched: 0,
    medianMinutes: null,
    meanMinutes: null,
    withinFifteenMin: 0,
    overOneDay: 0,
  }

  const minutes: number[] = []
  for (const lead of leads) {
    if (lead.status === 'NEW') {
      stats.untouched++
      continue
    }
    if (!lead.firstTouchedAt) {
      stats.unmeasurable++
      continue
    }
    // Clock skew or a backfill could put the touch before the lead. Zero, not
    // a negative that would drag the median below the floor.
    const delta = Math.max(
      0,
      (lead.firstTouchedAt.getTime() - lead.createdAt.getTime()) / 60000
    )
    minutes.push(delta)
    if (delta <= 15) stats.withinFifteenMin++
    if (delta > 24 * 60) stats.overOneDay++
  }

  stats.measured = minutes.length
  stats.medianMinutes = median(minutes)
  stats.meanMinutes = minutes.length
    ? minutes.reduce((sum, m) => sum + m, 0) / minutes.length
    : null

  return stats
}
