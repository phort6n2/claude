import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runCallAnalysisPipeline } from '@/lib/call-analysis/pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/recover-stuck-call-analyses
 *
 * Reruns the pipeline for any CallAnalysis row that is still in a non-terminal
 * status (PENDING, DOWNLOADING, TRANSCRIBING, ANALYZING) older than 10 minutes,
 * and for FAILED rows younger than 24h (so transient errors get a retry).
 *
 * Processed serially to keep memory bounded; capped per run.
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && !cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stuckBefore = new Date(Date.now() - 10 * 60 * 1000) // 10 min
  const failedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24h

  const stuck = await prisma.callAnalysis.findMany({
    where: {
      OR: [
        {
          status: { in: ['PENDING', 'DOWNLOADING', 'TRANSCRIBING', 'ANALYZING'] },
          updatedAt: { lt: stuckBefore },
        },
        {
          status: 'FAILED',
          updatedAt: { gt: failedAfter, lt: stuckBefore },
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: 5,
    select: { id: true, status: true },
  })

  const results: Array<{ id: string; ok: boolean }> = []
  for (const row of stuck) {
    // Reset FAILED rows back to PENDING so the pipeline status transitions work.
    if (row.status === 'FAILED') {
      await prisma.callAnalysis.update({
        where: { id: row.id },
        data: { status: 'PENDING', errorMessage: null },
      })
    }
    const ok = await runCallAnalysisPipeline(row.id)
    results.push({ id: row.id, ok })
  }

  return NextResponse.json({ processed: results.length, results })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
