import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { attachToMonthlyReport } from '@/lib/seo-report-inbound'
import type { SeoReport } from '@/lib/seo-report'

export const dynamic = 'force-dynamic'

/**
 * POST { clientId } — file a received SEO report against a shop by hand, for
 * the one whose website matched no client (a domain not recorded here yet).
 *
 * Only the MATCH is overridden. A report held back for naming the supplier, or
 * one with no readable month or figures, stays held: assigning it would put
 * exactly what the inbox refused in front of a client.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const clientId = typeof body?.clientId === 'string' ? body.clientId : ''
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const row = await prisma.seoReportEmail.findUnique({
    where: { id },
    select: { kind: true, parsed: true, year: true, month: true },
  })
  if (!row || row.kind !== 'report' || !row.parsed) {
    return NextResponse.json({ error: 'Not a report that was read.' }, { status: 404 })
  }
  const parsed = row.parsed as unknown as SeoReport
  if (parsed.supplierTraces?.length) {
    return NextResponse.json({ error: 'This file names the supplier, so it stays held.' }, { status: 409 })
  }
  if (!row.year || !row.month) {
    return NextResponse.json({ error: 'No month could be read from it.' }, { status: 409 })
  }
  if (!parsed.articles && !parsed.links && !parsed.ai) {
    return NextResponse.json({ error: 'Nothing in it could be read.' }, { status: 409 })
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  await prisma.seoReportEmail.update({ where: { id }, data: { clientId, problem: null } })
  const outcome = await attachToMonthlyReport(clientId, row.year, row.month)
  return NextResponse.json({ ok: true, message: `Filed under ${client.businessName}: ${outcome}.` })
}
