/**
 * Per-client "three things to work on".
 *
 * Rather than judging each call in isolation, this rolls up the coaching focus
 * codes the model tagged on every missed opportunity and surfaces the patterns
 * that actually repeat for a given shop. Three is deliberate: a short, stable
 * list a shop owner can coach against beats a long one nobody acts on.
 *
 * Only calls analysed since the focus-code taxonomy shipped carry codes, so
 * older rows simply contribute nothing instead of being guessed at.
 */

import { prisma } from '@/lib/db'
import { focusAreaLabel, isFocusAreaCode, type FocusAreaCode } from './rating'

const DEFAULT_LOOKBACK_DAYS = 60
// Below this there isn't enough signal to call something a pattern.
const MIN_CALLS_FOR_PATTERN = 3

export interface ClientFocusArea {
  code: FocusAreaCode
  label: string
  /** How many calls in the window raised this. */
  count: number
  /** Share of analysed calls in the window, 0-100. */
  pct: number
  /** A real quote from one of those calls, so the advice isn't abstract. */
  example: { quote: string; timestamp: string | null } | null
}

export interface ClientFocusSummary {
  callsAnalysed: number
  bookedCount: number
  /** Null until there are enough analysed calls to see a pattern. */
  focusAreas: ClientFocusArea[] | null
  reason?: string
}

interface MissedOpportunity {
  moment?: string
  transcript_quote?: string
  timestamp?: string
  what_should_have_happened?: string
  focus_area?: string
}

interface CoachingAnalysis {
  outcome?: string
  missed_opportunities?: MissedOpportunity[]
}

export async function getClientFocusAreas(
  clientId: string,
  days: number = DEFAULT_LOOKBACK_DAYS
): Promise<ClientFocusSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await prisma.callAnalysis.findMany({
    where: { clientId, status: 'COMPLETE', createdAt: { gte: since } },
    select: { analysis: true, outcome: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const callsAnalysed = rows.length
  const bookedCount = rows.filter((r) => r.outcome === 'booked').length

  if (callsAnalysed < MIN_CALLS_FOR_PATTERN) {
    return {
      callsAnalysed,
      bookedCount,
      focusAreas: null,
      reason: `Need at least ${MIN_CALLS_FOR_PATTERN} analysed calls to spot patterns.`,
    }
  }

  // Count each code once per call — a single call harping on one issue
  // shouldn't outweigh a pattern seen across many calls.
  const counts = new Map<FocusAreaCode, number>()
  const examples = new Map<FocusAreaCode, { quote: string; timestamp: string | null }>()

  for (const row of rows) {
    const analysis = row.analysis as CoachingAnalysis | null
    const missed = analysis?.missed_opportunities
    if (!Array.isArray(missed)) continue

    const seenInThisCall = new Set<FocusAreaCode>()
    for (const m of missed) {
      const code = m?.focus_area
      if (!isFocusAreaCode(code) || seenInThisCall.has(code)) continue
      seenInThisCall.add(code)
      counts.set(code, (counts.get(code) ?? 0) + 1)

      if (!examples.has(code) && m.transcript_quote) {
        examples.set(code, {
          quote: m.transcript_quote,
          timestamp: m.timestamp ?? null,
        })
      }
    }
  }

  if (counts.size === 0) {
    return {
      callsAnalysed,
      bookedCount,
      focusAreas: null,
      reason: 'No recurring coaching patterns found yet.',
    }
  }

  const focusAreas = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => ({
      code,
      label: focusAreaLabel(code),
      count,
      pct: Math.round((count / callsAnalysed) * 100),
      example: examples.get(code) ?? null,
    }))

  return { callsAnalysed, bookedCount, focusAreas }
}
