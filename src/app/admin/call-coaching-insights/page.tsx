'use client'

import { useEffect, useState } from 'react'
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, Users } from 'lucide-react'

interface Counted {
  key: string
  count: number
  pctAll: number
  countSold: number
  pctOfSoldCalls: number
  countLost: number
  pctOfLostCalls: number
}

interface ScoreBucket {
  label: string
  count: number
  sold: number
  lost: number
  pctSoldOfDecided: number | null
}

interface PerClient {
  clientId: string
  businessName: string
  totalCalls: number
  avgScore: number | null
  pctBookedByAi: number
  pctActuallySold: number | null
  decidedLeads: number
}

interface InsightsData {
  rangeDays: number
  sinceIso: string
  totals: {
    callsAnalyzed: number
    avgScore: number
    withLeadOutcome: number
    withTerminalLeadOutcome: number
    soldCount: number
    lostCount: number
  }
  scoreHistogram: ScoreBucket[]
  outcomeBreakdown: Record<string, number>
  actualOutcomeBreakdown: Record<string, number>
  topMissedOpportunities: Counted[]
  topTags: Counted[]
  topDidWell: Counted[]
  topDeductions: Counted[]
  perClient: PerClient[]
}

const RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
]

export default function CallCoachingInsightsPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/call-coaching-insights?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Coaching Insights</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cross-client patterns in completed call analyses
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                days === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading insights…
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 py-4">Failed to load: {error}</div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <StatsHeader data={data} />
          <ScoreOutcomeCorrelation data={data} />
          <RankedSection
            title="What booked calls have in common"
            subtitle="Tags + things the rep did well, with frequency in sold-lead calls vs all"
            icon={CheckCircle2}
            iconColor="text-green-600"
            items={[
              ...data.topDidWell.map((i) => ({ ...i, category: 'Did well' })),
              ...data.topTags.map((i) => ({ ...i, category: 'Tag' })),
            ]
              .sort((a, b) => b.pctOfSoldCalls - b.pctOfLostCalls - (a.pctOfSoldCalls - a.pctOfLostCalls))
              .slice(0, 12)}
            soldCount={data.totals.soldCount}
            lostCount={data.totals.lostCount}
          />
          <RankedSection
            title="What lost calls have in common"
            subtitle="Missed opportunities + deduction reasons, ranked by frequency in lost-lead calls"
            icon={AlertTriangle}
            iconColor="text-orange-600"
            items={[
              ...data.topMissedOpportunities.map((i) => ({ ...i, category: 'Missed' })),
              ...data.topDeductions.map((i) => ({ ...i, category: 'Deduction' })),
            ]
              .sort((a, b) => b.pctOfLostCalls - b.pctOfSoldCalls - (a.pctOfLostCalls - a.pctOfSoldCalls))
              .slice(0, 12)}
            soldCount={data.totals.soldCount}
            lostCount={data.totals.lostCount}
          />
          <PerClientLeaderboard rows={data.perClient} />
        </div>
      )}
    </div>
  )
}

function StatsHeader({ data }: { data: InsightsData }) {
  const t = data.totals
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Calls analyzed" value={t.callsAnalyzed.toLocaleString()} />
      <StatCard label="Average score" value={`${t.avgScore}/100`} />
      <StatCard
        label="Leads with outcome"
        value={`${t.withTerminalLeadOutcome}/${t.callsAnalyzed}`}
        subtitle="SOLD/LOST/QUOTED/UNQUALIFIED"
      />
      <StatCard
        label="Sold vs lost"
        value={`${t.soldCount} / ${t.lostCount}`}
        subtitle="Decided leads"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  )
}

function ScoreOutcomeCorrelation({ data }: { data: InsightsData }) {
  const maxCount = Math.max(...data.scoreHistogram.map((b) => b.count), 1)
  return (
    <Card
      title="Score vs actual outcome"
      subtitle="Does the rubric predict bookings? Bars show call volume per score range; right column shows what % of those calls' leads ended up SOLD."
      icon={TrendingUp}
    >
      <div className="space-y-2">
        {data.scoreHistogram.map((b) => (
          <div key={b.label} className="flex items-center gap-3 text-sm">
            <div className="w-16 font-mono text-gray-600">{b.label}</div>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${(b.count / maxCount) * 100}%` }}
              />
            </div>
            <div className="w-16 text-right tabular-nums text-gray-700">{b.count}</div>
            <div className="w-28 text-right tabular-nums text-gray-700">
              {b.pctSoldOfDecided != null ? (
                <span
                  className={
                    b.pctSoldOfDecided >= 60
                      ? 'text-green-600 font-medium'
                      : b.pctSoldOfDecided >= 30
                      ? 'text-yellow-700'
                      : 'text-red-600'
                  }
                >
                  {b.pctSoldOfDecided}% sold
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

interface CategorizedItem extends Counted {
  category: string
}

function RankedSection({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  items,
  soldCount,
  lostCount,
}: {
  title: string
  subtitle: string
  icon: React.ElementType
  iconColor: string
  items: CategorizedItem[]
  soldCount: number
  lostCount: number
}) {
  if (items.length === 0) {
    return (
      <Card title={title} subtitle={subtitle} icon={Icon} iconColor={iconColor}>
        <div className="text-sm text-gray-500">
          Not enough data yet. Mark more leads as SOLD or LOST to see patterns.
        </div>
      </Card>
    )
  }
  return (
    <Card title={title} subtitle={subtitle} icon={Icon} iconColor={iconColor}>
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-1">
          <div className="col-span-6">Theme</div>
          <div className="col-span-2 text-right">Calls</div>
          <div className="col-span-2 text-right">% of sold ({soldCount})</div>
          <div className="col-span-2 text-right">% of lost ({lostCount})</div>
        </div>
        {items.map((item, i) => (
          <div
            key={`${item.category}-${item.key}-${i}`}
            className="grid grid-cols-12 gap-2 items-center text-sm bg-gray-50 rounded p-2"
          >
            <div className="col-span-6">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-2">
                {item.category}
              </span>
              <span className="text-gray-900">{item.key}</span>
            </div>
            <div className="col-span-2 text-right tabular-nums text-gray-700">
              {item.count}
            </div>
            <div className="col-span-2 text-right tabular-nums">
              <span className={item.pctOfSoldCalls > item.pctOfLostCalls ? 'text-green-600 font-medium' : 'text-gray-500'}>
                {item.pctOfSoldCalls}%
              </span>
            </div>
            <div className="col-span-2 text-right tabular-nums">
              <span className={item.pctOfLostCalls > item.pctOfSoldCalls ? 'text-red-600 font-medium' : 'text-gray-500'}>
                {item.pctOfLostCalls}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PerClientLeaderboard({ rows }: { rows: PerClient[] }) {
  return (
    <Card
      title="Per-client breakdown"
      subtitle="Who's doing well, who needs the most coaching"
      icon={Users}
    >
      {rows.length === 0 ? (
        <div className="text-sm text-gray-500">No call analyses yet in this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 text-left">
                <th className="py-2 pr-3 font-normal">Client</th>
                <th className="py-2 px-3 text-right font-normal">Calls</th>
                <th className="py-2 px-3 text-right font-normal">Avg score</th>
                <th className="py-2 px-3 text-right font-normal">% AI booked</th>
                <th className="py-2 pl-3 text-right font-normal">% actually sold</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.clientId} className="border-t border-gray-100">
                  <td className="py-2 pr-3 text-gray-900">{c.businessName}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                    {c.totalCalls}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {c.avgScore != null ? (
                      <span
                        className={
                          c.avgScore >= 80
                            ? 'text-green-600 font-medium'
                            : c.avgScore >= 60
                            ? 'text-yellow-700'
                            : c.avgScore >= 40
                            ? 'text-orange-600'
                            : 'text-red-600'
                        }
                      >
                        {c.avgScore}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                    {c.pctBookedByAi}%
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {c.pctActuallySold != null ? (
                      <span className="text-gray-700">
                        {c.pctActuallySold}%
                        <span className="text-xs text-gray-400 ml-1">
                          ({c.decidedLeads})
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Card({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ElementType
  iconColor?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start gap-3 mb-4">
        {Icon && (
          <div className={`mt-0.5 ${iconColor ?? 'text-blue-600'}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}
