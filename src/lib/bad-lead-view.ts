import { prisma } from '@/lib/db'
import { reasonsFor, REASON_KEYS } from '@/lib/bad-lead'

/**
 * What the "Bad lead" panel is sent. Two shapes, on purpose: the admin gets the
 * trace, the model's proposals with their checks and the negatives with their
 * Undo; the shop gets its own mark and the plain result — which searches were
 * stopped — and nothing about how the decision was made.
 */

export async function reasonsForLead(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { offersWindshieldRepair: true, offersRockChipRepair: true },
  })
  return reasonsFor(client || { offersWindshieldRepair: true, offersRockChipRepair: true }).map((r) => ({ key: r.key, label: r.label }))
}

export function validReason(key: unknown): key is string {
  return typeof key === 'string' && REASON_KEYS.includes(key)
}

export async function adminView(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, clientId: true } })
  if (!lead) return null
  const [reasons, mark, client] = await Promise.all([
    reasonsForLead(lead.clientId),
    prisma.badLeadMark.findUnique({ where: { leadId } }),
    prisma.client.findUnique({ where: { id: lead.clientId }, select: { autoNegatives: true, businessName: true } }),
  ])
  const changes = mark
    ? await prisma.negativeKeywordChange.findMany({ where: { badLeadMarkId: mark.id }, orderBy: { createdAt: 'asc' } })
    : []
  return { clientId: lead.clientId, businessName: client?.businessName || '', autoNegatives: client?.autoNegatives ?? true, reasons, mark, changes }
}

export async function portalView(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, clientId: true } })
  if (!lead) return null
  const [reasons, mark] = await Promise.all([reasonsForLead(lead.clientId), prisma.badLeadMark.findUnique({ where: { leadId } })])
  const stopped = mark
    ? await prisma.negativeKeywordChange.findMany({
        where: { badLeadMarkId: mark.id, status: { in: ['applied', 'unconfirmed'] }, removedAt: null },
        select: { text: true },
      })
    : []
  return {
    reasons,
    mark: mark
      ? {
          reason: mark.reason,
          notes: mark.notes,
          status: mark.status,
          undone: !!mark.undoneAt,
          createdAt: mark.createdAt,
          stopped: stopped.map((s) => s.text),
        }
      : null,
  }
}
