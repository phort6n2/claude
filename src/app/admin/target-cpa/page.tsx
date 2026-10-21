export const dynamic = 'force-dynamic'
// The first visit may read every account (see below): seconds, not minutes.
export const maxDuration = 300

import { prisma } from '@/lib/db'
import { requireTargetCpaPage } from '@/lib/target-cpa-access'
import { applyEnabled, currentTcpaSnapshot } from '@/lib/target-cpa-fetch'
import { buildRows } from '@/lib/target-cpa'
import TargetCpaPanel, { type ChangeEntry } from '@/components/admin/TargetCpaPanel'

/**
 * TARGET CPA VS GOOGLE — every AGMP campaign beside the target Google's own
 * simulation says would spend its budget. Underspending campaigns lead.
 *
 * The owner's page (`requireTargetCpaPage`), read from the morning snapshot;
 * the rows are computed here from its stored inputs, so a rule fix applies to
 * the snapshot already on file. The apply button exists only with
 * TARGET_CPA_APPLY_ENABLED=true.
 */
export default async function Page() {
  await requireTargetCpaPage()

  const { latest, autoError } = await currentTcpaSnapshot()
  const changes = await prisma.targetCpaChange
    .findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    .catch(() => [])

  const entries: ChangeEntry[] = changes.map((c) => ({
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    userEmail: c.userEmail,
    customerId: c.customerId,
    accountName: c.accountName,
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    scope: c.scope,
    // BigInt does not cross to the browser; micros fit a double exactly.
    oldMicros: c.oldMicros == null ? null : Number(c.oldMicros),
    newMicros: Number(c.newMicros),
    readBackMicros: c.readBackMicros == null ? null : Number(c.readBackMicros),
    affectedCampaigns: c.affectedCampaigns,
    status: c.status,
    error: c.error,
  }))

  return (
    <TargetCpaPanel
      builtAt={latest?.snapshot.builtAt ?? null}
      trigger={latest?.trigger ?? null}
      durationMs={latest?.durationMs ?? null}
      rows={latest ? buildRows(latest.snapshot) : []}
      errors={(latest?.snapshot.accounts ?? []).filter((a) => a.error).map((a) => ({ name: a.name, error: a.error as string }))}
      accountCount={latest?.snapshot.accounts.length ?? 0}
      changes={entries}
      applyEnabled={applyEnabled()}
      autoError={autoError}
    />
  )
}
