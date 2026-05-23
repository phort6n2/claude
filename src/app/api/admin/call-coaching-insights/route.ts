import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/call-coaching-insights[?days=30&clientId=all]
 *
 * Cross-client aggregate analytics over completed CallAnalysis rows. Built to
 * answer "what do calls that book have in common, and how does the rubric
 * correlate with actual lead outcomes?"
 *
 * Returns counts/percentages rather than raw rows. Free-text fields
 * (missed_opportunity moments, tags, did_well items, deduction reasons) are
 * grouped by exact string match — Claude is reasonably consistent in
 * phrasing, and exact-match grouping is the most honest starting point until
 * we add structured codes to the prompt.
 */

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'QUOTED' | 'SOLD' | 'LOST'

interface DeductionApplied {
  reason: string
  points: number
}

interface MissedOpportunity {
  moment: string
  transcript_quote?: string
  timestamp?: string
  what_should_have_happened?: string
}

interface CoachingAnalysis {
  score?: number
  subscores?: Record<string, number>
  outcome?: string
  missed_opportunities?: MissedOpportunity[]
  deductions_applied?: DeductionApplied[]
  did_well?: string[]
  tags?: string[]
}

const SCORE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0-39', min: 0, max: 39 },
  { label: '40-59', min: 40, max: 59 },
  { label: '60-79', min: 60, max: 79 },
  { label: '80-100', min: 80, max: 100 },
]

const TERMINAL_STATUSES = new Set<LeadStatus>(['SOLD', 'LOST', 'QUOTED', 'UNQUALIFIED'])

function bucketFor(score: number) {
  return SCORE_BUCKETS.find((b) => score >= b.min && score <= b.max) ?? null
}

interface CountMap {
  [key: string]: { all: number; sold: number; lost: number }
}

function bump(map: CountMap, key: string, leadStatus: LeadStatus | null | undefined) {
  if (!key) return
  if (!map[key]) map[key] = { all: 0, sold: 0, lost: 0 }
  map[key].all += 1
  if (leadStatus === 'SOLD') map[key].sold += 1
  if (leadStatus === 'LOST') map[key].lost += 1
}

function topN(
  map: CountMap,
  n: number,
  totals: { all: number; sold: number; lost: number }
) {
  return Object.entries(map)
    .map(([key, v]) => ({
      key,
      count: v.all,
      pctAll: totals.all > 0 ? Math.round((v.all / totals.all) * 100) : 0,
      countSold: v.sold,
      pctOfSoldCalls: totals.sold > 0 ? Math.round((v.sold / totals.sold) * 100) : 0,
      countLost: v.lost,
      pctOfLostCalls: totals.lost > 0 ? Math.round((v.lost / totals.lost) * 100) : 0,
    }))
    // Differentiator score: items frequent in SOLD but rare in LOST get bumped up.
    .sort((a, b) => {
      const diffA = a.pctOfSoldCalls - a.pctOfLostCalls
      const diffB = b.pctOfSoldCalls - b.pctOfLostCalls
      if (b.count !== a.count) return b.count - a.count
      return diffB - diffA
    })
    .slice(0, n)
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10) || 30))
  const clientIdFilter = url.searchParams.get('clientId')

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await withRetry(() =>
    prisma.callAnalysis.findMany({
      where: {
        status: 'COMPLETE',
        completedAt: { gte: since },
        ...(clientIdFilter && clientIdFilter !== 'all'
          ? { clientId: clientIdFilter }
          : {}),
      },
      select: {
        id: true,
        clientId: true,
        score: true,
        outcome: true,
        analysis: true,
        completedAt: true,
        client: { select: { id: true, businessName: true } },
        lead: { select: { id: true, status: true } },
      },
    })
  )

  // Top-line totals
  const callsAnalyzed = rows.length
  const withScore = rows.filter((r) => typeof r.score === 'number')
  const avgScore =
    withScore.length > 0
      ? Math.round(
          withScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / withScore.length
        )
      : 0

  // Outcome breakdown (Claude's prediction)
  const outcomeBreakdown: Record<string, number> = {}
  for (const r of rows) {
    const o = r.outcome ?? 'unknown'
    outcomeBreakdown[o] = (outcomeBreakdown[o] ?? 0) + 1
  }

  // Actual lead-status breakdown (the gold)
  const actualOutcomeBreakdown: Record<string, number> = {}
  let withLeadOutcome = 0
  let withTerminalLeadOutcome = 0
  for (const r of rows) {
    const status = (r.lead?.status as LeadStatus | undefined) ?? null
    if (status) {
      withLeadOutcome += 1
      actualOutcomeBreakdown[status] = (actualOutcomeBreakdown[status] ?? 0) + 1
      if (TERMINAL_STATUSES.has(status)) withTerminalLeadOutcome += 1
    }
  }

  // Score histogram + per-bucket booking rate
  const scoreHistogram = SCORE_BUCKETS.map((b) => {
    const inBucket = withScore.filter(
      (r) => (r.score ?? -1) >= b.min && (r.score ?? -1) <= b.max
    )
    const sold = inBucket.filter((r) => r.lead?.status === 'SOLD').length
    const lost = inBucket.filter((r) => r.lead?.status === 'LOST').length
    const decided = inBucket.filter(
      (r) => r.lead && TERMINAL_STATUSES.has(r.lead.status as LeadStatus)
    ).length
    return {
      label: b.label,
      count: inBucket.length,
      sold,
      lost,
      pctSoldOfDecided: decided > 0 ? Math.round((sold / decided) * 100) : null,
    }
  })

  // Aggregations on free-text analysis fields
  const moments: CountMap = {}
  const tags: CountMap = {}
  const didWell: CountMap = {}
  const deductions: CountMap = {}

  let soldCount = 0
  let lostCount = 0

  for (const r of rows) {
    const a = (r.analysis as CoachingAnalysis | null) ?? null
    if (!a) continue
    const leadStatus = (r.lead?.status as LeadStatus | undefined) ?? null
    if (leadStatus === 'SOLD') soldCount += 1
    if (leadStatus === 'LOST') lostCount += 1

    for (const m of a.missed_opportunities ?? []) {
      if (m?.moment) bump(moments, m.moment.trim(), leadStatus)
    }
    for (const t of a.tags ?? []) {
      if (typeof t === 'string' && t.trim()) bump(tags, t.trim(), leadStatus)
    }
    for (const w of a.did_well ?? []) {
      if (typeof w === 'string' && w.trim()) bump(didWell, w.trim(), leadStatus)
    }
    for (const d of a.deductions_applied ?? []) {
      if (d?.reason) bump(deductions, d.reason.trim(), leadStatus)
    }
  }

  const totals = { all: callsAnalyzed, sold: soldCount, lost: lostCount }

  // Per-client leaderboard
  const perClientMap = new Map<
    string,
    {
      clientId: string
      businessName: string
      totalCalls: number
      scoreSum: number
      scoreCount: number
      aiBookedCount: number
      actualSoldCount: number
      decidedLeadsCount: number
    }
  >()
  for (const r of rows) {
    const id = r.clientId
    if (!perClientMap.has(id)) {
      perClientMap.set(id, {
        clientId: id,
        businessName: r.client?.businessName ?? 'Unknown',
        totalCalls: 0,
        scoreSum: 0,
        scoreCount: 0,
        aiBookedCount: 0,
        actualSoldCount: 0,
        decidedLeadsCount: 0,
      })
    }
    const c = perClientMap.get(id)!
    c.totalCalls += 1
    if (typeof r.score === 'number') {
      c.scoreSum += r.score
      c.scoreCount += 1
    }
    if (r.outcome === 'booked') c.aiBookedCount += 1
    const status = r.lead?.status as LeadStatus | undefined
    if (status && TERMINAL_STATUSES.has(status)) {
      c.decidedLeadsCount += 1
      if (status === 'SOLD') c.actualSoldCount += 1
    }
  }
  const perClient = Array.from(perClientMap.values())
    .map((c) => ({
      clientId: c.clientId,
      businessName: c.businessName,
      totalCalls: c.totalCalls,
      avgScore: c.scoreCount > 0 ? Math.round(c.scoreSum / c.scoreCount) : null,
      pctBookedByAi:
        c.totalCalls > 0 ? Math.round((c.aiBookedCount / c.totalCalls) * 100) : 0,
      pctActuallySold:
        c.decidedLeadsCount > 0
          ? Math.round((c.actualSoldCount / c.decidedLeadsCount) * 100)
          : null,
      decidedLeads: c.decidedLeadsCount,
    }))
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))

  return NextResponse.json({
    rangeDays: days,
    sinceIso: since.toISOString(),
    totals: {
      callsAnalyzed,
      avgScore,
      withLeadOutcome,
      withTerminalLeadOutcome,
      soldCount,
      lostCount,
    },
    scoreHistogram,
    outcomeBreakdown,
    actualOutcomeBreakdown,
    topMissedOpportunities: topN(moments, 15, totals),
    topTags: topN(tags, 15, totals),
    topDidWell: topN(didWell, 15, totals),
    topDeductions: topN(deductions, 15, totals),
    perClient,
  })
}
