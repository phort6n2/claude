import { NextRequest, NextResponse } from 'next/server'
import { runCallAnalysisPipeline } from '@/lib/call-analysis/pipeline'

export const dynamic = 'force-dynamic'
// Transcription + Claude analysis can take a couple of minutes.
export const maxDuration = 300

/**
 * Internal worker that runs the call-analysis pipeline for a single row.
 *
 * Authorized via CRON_SECRET (same secret used by all internal/cron endpoints).
 * Triggered by the call-recording webhook (fire-and-forget) and by the
 * recovery cron for stuck rows.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { callAnalysisId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const callAnalysisId = body.callAnalysisId
  if (!callAnalysisId) {
    return NextResponse.json({ error: 'Missing callAnalysisId' }, { status: 400 })
  }

  const ok = await runCallAnalysisPipeline(callAnalysisId)
  return NextResponse.json({ success: ok, callAnalysisId })
}
