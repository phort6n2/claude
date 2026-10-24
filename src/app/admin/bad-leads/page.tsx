export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { requireTargetCpaPage } from '@/lib/target-cpa-access'
import { autoEnabled } from '@/lib/bad-lead-run'
import BadLeadsPanel, { type MarkRow, type ChangeRow, type ClientRow } from '@/components/admin/BadLeadsPanel'

/** The report's window. Outside the component: a clock read is not render. */
function windowStart(): Date {
  return new Date(Date.now() - 30 * 86_400_000)
}

/**
 * BAD LEADS — the queue, the report and the log. What waits for the owner (a
 * negative the checks would not add on their own), what was added and can be
 * undone, and per client: last 30 days by reason and by campaign, and what
 * could not be traced. The owner's page (the Target CPA rule).
 */
export default async function Page() {
  await requireTargetCpaPage()
  const since = windowStart()

  const [marks, changes, clients] = await Promise.all([
    prisma.badLeadMark.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { status: 'review' }] },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, source: true, createdAt: true } },
      },
    }),
    prisma.negativeKeywordChange.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.client.findMany({
      where: { adsTracking: { googleAdsCustomerId: { not: null } } },
      select: { id: true, businessName: true, autoNegatives: true },
      orderBy: { businessName: 'asc' },
    }),
  ])
  const names = new Map(clients.map((c) => [c.id, c.businessName]))
  const extraIds = [...new Set(marks.map((m) => m.clientId).filter((id) => !names.has(id)))]
  if (extraIds.length) {
    for (const c of await prisma.client.findMany({ where: { id: { in: extraIds } }, select: { id: true, businessName: true } })) names.set(c.id, c.businessName)
  }

  const markRows: MarkRow[] = marks.map((m) => {
    const trace = (m.trace || {}) as { campaign?: { name?: string } | null; adGroup?: { name?: string } | null; note?: string }
    const decision = (m.decision || {}) as { proposals?: Array<{ outcome: string }> }
    const name = [m.lead.firstName, m.lead.lastName].filter(Boolean).join(' ') || m.lead.phone || m.lead.email || 'Lead'
    return {
      id: m.id,
      leadId: m.leadId,
      clientId: m.clientId,
      clientName: names.get(m.clientId) || '',
      leadName: name,
      source: m.lead.source,
      leadAt: m.lead.createdAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
      reason: m.reason,
      status: m.status,
      confidence: m.confidence,
      markedBy: m.markedBy,
      markedByRole: m.markedByRole,
      undone: !!m.undoneAt,
      campaign: trace.campaign?.name || null,
      adGroup: trace.adGroup?.name || null,
      note: trace.note || null,
      waiting: (decision.proposals || []).filter((p) => p.outcome === 'review' || p.outcome === 'failed').length,
    }
  })
  const changeRows: ChangeRow[] = changes.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    clientName: names.get(c.clientId) || '',
    leadId: c.leadId,
    text: c.text,
    matchType: c.matchType,
    level: c.level,
    where: c.level === 'shared_list' ? c.sharedSetName || 'list' : c.campaignName || c.campaignId || '',
    status: c.status,
    source: c.source,
    userEmail: c.userEmail,
    createdAt: c.createdAt.toISOString(),
    removedAt: c.removedAt?.toISOString() || null,
    error: c.error,
  }))
  const clientRows: ClientRow[] = clients.map((c) => ({ id: c.id, name: c.businessName, autoNegatives: c.autoNegatives }))

  return <BadLeadsPanel marks={markRows} changes={changeRows} clients={clientRows} autoEnabled={autoEnabled()} />
}
