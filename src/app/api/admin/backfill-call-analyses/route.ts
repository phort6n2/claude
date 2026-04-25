import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-shot backfill: create CallAnalysis rows for recent phone leads that have
 * a recording URL but no analysis yet, and kick off the pipeline for each.
 *
 * Auth: ?secret=$CRON_SECRET (browser-friendly).
 *
 * Defaults to 2 days; override with ?days=N (max 30).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (new URL(req.url).searchParams.get('secret') === secret) return true
  return false
}

async function backfill(req: NextRequest) {
  const url = new URL(req.url)
  const daysParam = url.searchParams.get('days')
  const days = Math.min(30, Math.max(1, parseInt(daysParam ?? '2', 10) || 2))
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Phone leads in the window with a recording URL.
  const candidates = await prisma.lead.findMany({
    where: {
      source: 'PHONE',
      callRecordingUrl: { not: null },
      createdAt: { gte: cutoff },
    },
    select: {
      id: true,
      clientId: true,
      callRecordingUrl: true,
      highlevelContactId: true,
      phone: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Skip leads that already have a CallAnalysis row.
  const existing = await prisma.callAnalysis.findMany({
    where: { leadId: { in: candidates.map((l) => l.id) } },
    select: { leadId: true },
  })
  const alreadyAnalyzed = new Set(existing.map((e) => e.leadId).filter(Boolean) as string[])

  const created: string[] = []
  const skipped: string[] = []
  const failed: Array<{ leadId: string; error: string }> = []

  for (const lead of candidates) {
    if (alreadyAnalyzed.has(lead.id)) {
      skipped.push(lead.id)
      continue
    }
    if (!lead.callRecordingUrl || !lead.callRecordingUrl.startsWith('http')) {
      skipped.push(lead.id)
      continue
    }

    try {
      const row = await prisma.callAnalysis.create({
        data: {
          clientId: lead.clientId,
          leadId: lead.id,
          highlevelContactId: lead.highlevelContactId,
          recordingUrl: lead.callRecordingUrl,
          callerPhone: lead.phone,
          callDirection: 'inbound',
          status: 'PENDING',
        },
        select: { id: true },
      })
      kickOffCallAnalysis(req, row.id)
      created.push(row.id)
    } catch (err) {
      failed.push({
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    days,
    cutoff,
    candidates: candidates.length,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    failures: failed,
  })
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}
