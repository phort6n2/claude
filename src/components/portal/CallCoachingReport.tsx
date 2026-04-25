'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Play } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface MissedOpportunity {
  moment: string
  transcript_quote: string
  timestamp: string
  what_should_have_happened: string
}

interface CoachingAnalysis {
  score: number
  subscores: {
    discovery: number
    value_building: number
    sales_mechanics: number
    communication: number
    deductions: number
  }
  outcome: string
  missed_opportunities: MissedOpportunity[]
  did_well: string[]
  coaching_note: string
  sentiment: {
    customer_overall: string
    rep_overall: string
    key_emotional_moment: string | null
  }
  tags: string[]
}

interface AudioMetrics {
  durationSeconds: number
  repTalkSeconds: number
  customerTalkSeconds: number
  repTalkPct: number
  customerTalkPct: number
  interruptionsByRep: number
  longestSilenceSeconds: number
  repSpeakerIndex: number
}

interface CallAnalysisRow {
  id: string
  status: 'PENDING' | 'DOWNLOADING' | 'TRANSCRIBING' | 'ANALYZING' | 'COMPLETE' | 'FAILED'
  score: number | null
  outcome: string | null
  analysis: CoachingAnalysis | null
  audioMetrics: AudioMetrics | null
  durationSeconds: number | null
  recordingUrl: string | null
}

interface Props {
  leadId: string
  recordingUrl: string | null
  /** Endpoint to fetch the analysis from. Defaults to the portal-scoped one. */
  endpoint?: string
  /** Hide the audio player + outer card chrome. Use when a parent already
   *  renders the recording player. */
  embedded?: boolean
}

const OUTCOME_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'default' }> = {
  booked: { label: 'Booked', variant: 'success' },
  quote_sent: { label: 'Quote Sent', variant: 'info' },
  callback_scheduled: { label: 'Callback Scheduled', variant: 'info' },
  lost: { label: 'Lost', variant: 'default' },
  info_only: { label: 'Info Only', variant: 'default' },
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-50 border-green-200'
  if (score >= 60) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (score >= 40) return 'text-orange-700 bg-orange-50 border-orange-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function progressBarColor(score: number, max: number): string {
  const pct = (score / max) * 100
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-yellow-500'
  if (pct >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function timestampToSeconds(ts: string): number {
  const [m, s] = ts.split(':').map((n) => parseInt(n, 10))
  if (Number.isNaN(m) || Number.isNaN(s)) return 0
  return m * 60 + s
}

export function CallCoachingReport({
  leadId,
  recordingUrl,
  endpoint,
  embedded = false,
}: Props) {
  const [data, setData] = useState<CallAnalysisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fetchUrl = endpoint ?? `/api/portal/leads/${leadId}/call-analysis`

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      try {
        const res = await fetch(fetchUrl)
        if (!res.ok) {
          if (!cancelled) setLoading(false)
          return
        }
        const body = await res.json()
        if (cancelled) return
        setData(body.analysis ?? null)
        setLoading(false)

        // Keep polling while the analysis is still in flight.
        const status = body.analysis?.status
        if (status && status !== 'COMPLETE' && status !== 'FAILED') {
          timer = setTimeout(load, 5000)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [fetchUrl])

  function jumpTo(ts: string) {
    const seconds = timestampToSeconds(ts)
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    audio.play().catch(() => {})
  }

  // No recording at all and no analysis row — render nothing.
  if (!recordingUrl && !data) return null

  // Embedded variant: caller already renders the audio player and outer card.
  // Just render the report body, with no internal audio element. Jump-to-moment
  // links won't seek anything in this mode (parent owns the player).
  if (embedded) {
    return (
      <div className="mt-3">
        <ReportBody data={data} loading={loading} onJump={() => {}} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Recording</h3>

      {recordingUrl ? (
        <audio
          ref={audioRef}
          controls
          src={recordingUrl}
          preload="metadata"
          className="w-full mb-6"
        >
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="text-sm text-gray-500 mb-6">
          Recording not available yet.
        </p>
      )}

      <ReportBody data={data} loading={loading} onJump={jumpTo} />
    </div>
  )
}

function ReportBody({
  data,
  loading,
  onJump,
}: {
  data: CallAnalysisRow | null
  loading: boolean
  onJump: (ts: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 text-sm py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading coaching report…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-sm text-gray-500 py-4">
        Coaching report not available for this call.
      </div>
    )
  }

  if (data.status === 'FAILED') {
    return (
      <div className="text-sm text-gray-500 py-4">
        Coaching report unavailable for this call.
      </div>
    )
  }

  if (data.status !== 'COMPLETE' || !data.analysis) {
    return (
      <div className="flex items-center gap-3 text-gray-600 text-sm py-4 border-t pt-4">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        Analyzing call… this usually takes 1-2 minutes.
      </div>
    )
  }

  const a = data.analysis
  const metrics = data.audioMetrics
  const outcomeBadge = OUTCOME_LABELS[a.outcome] ?? {
    label: a.outcome,
    variant: 'default' as const,
  }

  return (
    <div className="border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-base font-semibold text-gray-900">Coaching Report</h4>
        <Badge variant={outcomeBadge.variant}>{outcomeBadge.label}</Badge>
      </div>

      {/* Score + sentiment */}
      <div className="flex items-center gap-6 mb-6">
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 ${scoreColor(
            a.score
          )} w-24 h-24`}
        >
          <div className="text-3xl font-bold">{a.score}</div>
          <div className="text-xs uppercase tracking-wide">/100</div>
        </div>
        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="text-gray-500">Customer:</span>{' '}
            <span className="font-medium capitalize">{a.sentiment.customer_overall}</span>
          </div>
          <div>
            <span className="text-gray-500">Rep:</span>{' '}
            <span className="font-medium capitalize">{a.sentiment.rep_overall}</span>
          </div>
          {a.sentiment.key_emotional_moment && (
            <div className="text-gray-500 text-xs italic">
              {a.sentiment.key_emotional_moment}
            </div>
          )}
        </div>
      </div>

      {/* Coaching note */}
      <Section title="Coaching Note">
        <p className="text-gray-800 leading-relaxed">{a.coaching_note}</p>
      </Section>

      {/* What went well */}
      {a.did_well?.length > 0 && (
        <Section title="What Went Well">
          <ul className="space-y-2">
            {a.did_well.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Missed opportunities */}
      {a.missed_opportunities?.length > 0 && (
        <Section title="Missed Opportunities">
          <ul className="space-y-4">
            {a.missed_opportunities.map((m, i) => (
              <li key={i} className="border-l-2 border-orange-300 pl-3">
                <div className="flex items-start gap-2 text-gray-900 font-medium">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <span>{m.moment}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600 italic">
                  [{m.timestamp}] &ldquo;{m.transcript_quote}&rdquo;
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  <span className="font-medium">Better approach:</span>{' '}
                  {m.what_should_have_happened}
                </div>
                <button
                  type="button"
                  onClick={() => onJump(m.timestamp)}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Play className="h-3 w-3" />
                  Jump to moment
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Call metrics */}
      {metrics && (
        <Section title="Call Metrics">
          <div className="space-y-2 text-sm">
            <MetricBar label="Rep talked" pct={metrics.repTalkPct} />
            <MetricBar label="Customer" pct={metrics.customerTalkPct} />
            <div className="text-gray-700 pt-1">
              Interruptions: {metrics.interruptionsByRep}
            </div>
            {data.durationSeconds != null && (
              <div className="text-gray-700">
                Duration: {Math.floor(data.durationSeconds / 60)}:
                {(data.durationSeconds % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Score breakdown */}
      <Section title="Score Breakdown">
        <div className="space-y-2 text-sm">
          <SubscoreRow label="Discovery" score={a.subscores.discovery} max={20} />
          <SubscoreRow label="Value Building" score={a.subscores.value_building} max={20} />
          <SubscoreRow label="Sales Mechanics" score={a.subscores.sales_mechanics} max={30} />
          <SubscoreRow label="Communication" score={a.subscores.communication} max={20} />
          {a.subscores.deductions !== 0 && (
            <div className="flex items-center justify-between text-gray-700">
              <span>Deductions</span>
              <span className="font-medium text-red-600">{a.subscores.deductions}</span>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {title}
      </h5>
      {children}
    </div>
  )
}

function MetricBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-gray-600">{label}</div>
      <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-gray-700 tabular-nums">{pct}%</div>
    </div>
  )
}

function SubscoreRow({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-gray-700">{label}</div>
      <div className="w-12 text-gray-900 font-medium tabular-nums">
        {score}/{max}
      </div>
      <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
        <div
          className={`h-full ${progressBarColor(score, max)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
