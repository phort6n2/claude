import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { syncSeoArticles } from '@/lib/seo-articles'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — pull articles from BabyLoveGrowth now.
 *
 * The nightly cron does the same thing; this exists so a new client's content
 * can be live the same afternoon rather than tomorrow. Idempotent: articles
 * are keyed on their provider id, so running it twice changes nothing.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const result = await syncSeoArticles()
  return NextResponse.json({ success: result.ok, ...result })
}
