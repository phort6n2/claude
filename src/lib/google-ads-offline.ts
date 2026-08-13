import { prisma } from '@/lib/db'
import { adsPost, adsSearch } from '@/lib/google-ads'

/**
 * Sending booked jobs back to Google Ads.
 *
 * The website tag already reports a form fill. A form fill is not the thing
 * anybody is buying — some are tyre-kickers, some are insurance jobs worth
 * four times a cash repair, and Smart Bidding cannot tell them apart because
 * nothing ever tells it. Uploading the actual sale value closes that: bidding
 * starts chasing revenue instead of submissions, and the clicks that produce
 * cheap non-jobs get bid down without anyone writing a negative keyword.
 *
 * That only works if the numbers are real. Every guard here exists to stop a
 * wrong number reaching Google, because a bad conversion value is worse than
 * no conversion value — it trains the bidding on a lie, and there is no
 * obvious symptom until the spend has moved.
 *
 * ---------------------------------------------------------------------------
 * Requirements the API imposes, all of which fail unhelpfully when unmet
 * ---------------------------------------------------------------------------
 *   - The conversion action must be type UPLOAD_CLICKS. A website-tag action
 *     will not accept uploads, and the error does not say so plainly.
 *   - conversionDateTime must carry a timezone offset, in the ACCOUNT's
 *     timezone: "2026-08-13 14:22:05+00:00".
 *   - partialFailure must be true. The request is rejected outright otherwise,
 *     which reads like a malformed body.
 *   - A click can only be attributed inside the conversion action's window,
 *     so an old gclid is silently useless.
 */

/** Google's own ceiling is 90 days; stay inside it with room to spare. */
const MAX_CLICK_AGE_DAYS = 85

export interface UploadCandidate {
  leadId: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  value: number
  /** When the job was booked, not when the lead arrived. */
  soldAt: Date
  clickAt: Date
  customerName: string
}

export interface OfflineAction {
  id: string
  name: string
  status: string
}

/**
 * The UPLOAD_CLICKS conversion actions in an account.
 *
 * Filtered in the query rather than after, so an account with fifty website
 * actions does not present fifty options of which only one can possibly work.
 */
export async function listUploadActions(
  customerId: string
): Promise<{ ok: true; actions: OfflineAction[] } | { ok: false; error: string }> {
  const result = await adsSearch(
    customerId,
    `SELECT conversion_action.id,
            conversion_action.name,
            conversion_action.status
     FROM conversion_action
     WHERE conversion_action.type = 'UPLOAD_CLICKS'`
  )
  if (!result.ok) return result

  const actions = result.rows.map((row) => {
    const a = (row as { conversionAction?: { id?: string; name?: string; status?: string } })
      .conversionAction
    return {
      id: String(a?.id ?? ''),
      name: a?.name || String(a?.id ?? ''),
      status: a?.status || 'UNKNOWN',
    }
  })
  return { ok: true, actions: actions.filter((a) => a.id) }
}

/**
 * "2026-08-13 14:22:05+00:00" — the format the API insists on.
 *
 * Everything is stamped UTC with an explicit +00:00 rather than converted to
 * the account's local zone. The offset is what makes the timestamp
 * unambiguous, and a conversion an hour out is not worth the risk of getting
 * a DST boundary wrong in a zone this code does not own.
 */
export function adsDateTime(date: Date): string {
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}+00:00`
}

/**
 * Booked jobs that are ready to send.
 *
 * A lead qualifies only when every one of these is true, and each exclusion is
 * a way the upload would otherwise be wrong rather than merely rejected:
 *
 *   - marked SOLD, with a value above zero — the whole point is the amount
 *   - carries a click id, since there is nothing to attach a conversion to
 *     without one
 *   - the click is inside the attribution window
 *   - not already uploaded, because Google counts a second upload as a second
 *     conversion unless it is sent as an adjustment
 *   - not a same-day duplicate row, so one enquiry books once
 */
export async function findUploadCandidates(
  clientId: string,
  limit = 200
): Promise<UploadCandidate[]> {
  const cutoff = new Date(Date.now() - MAX_CLICK_AGE_DAYS * 24 * 3600 * 1000)

  const leads = await prisma.lead
    .findMany({
      where: {
        clientId,
        status: 'SOLD',
        saleValue: { gt: 0 },
        adsUploadedAt: null,
        duplicateOfLeadId: null,
        createdAt: { gte: cutoff },
        OR: [
          { gclid: { not: null } },
          { gbraid: { not: null } },
          { wbraid: { not: null } },
        ],
      },
      orderBy: { saleDate: 'asc' },
      take: limit,
      select: {
        id: true,
        gclid: true,
        gbraid: true,
        wbraid: true,
        saleValue: true,
        saleDate: true,
        createdAt: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    })
    .catch(() => [])

  return leads
    .filter((l) => (l.gclid || l.gbraid || l.wbraid) && l.saleValue && l.saleValue > 0)
    .map((l) => ({
      leadId: l.id,
      gclid: l.gclid,
      gbraid: l.gbraid,
      wbraid: l.wbraid,
      value: l.saleValue as number,
      // The booking date is what Google should see. Falling back to when the
      // lead arrived is wrong by days, but it is inside the window and a
      // conversion dated slightly early beats no conversion at all.
      soldAt: l.saleDate ?? l.createdAt,
      clickAt: l.createdAt,
      customerName:
        [l.firstName, l.lastName].filter(Boolean).join(' ') || l.phone || l.id,
    }))
}

interface ClickConversion {
  conversionAction: string
  conversionDateTime: string
  conversionValue: number
  currencyCode: string
  orderId: string
  gclid?: string
  gbraid?: string
  wbraid?: string
}

function toConversion(
  candidate: UploadCandidate,
  customerId: string,
  actionId: string
): ClickConversion {
  const id = customerId.replace(/\D/g, '')
  return {
    conversionAction: `customers/${id}/conversionActions/${actionId}`,
    conversionDateTime: adsDateTime(candidate.soldAt),
    conversionValue: candidate.value,
    currencyCode: 'USD',
    // The lead id. Google dedups on this, so a re-run after a partial failure
    // cannot double-count the jobs that already went through — belt as well
    // as the adsUploadedAt braces on our side.
    orderId: candidate.leadId,
    ...(candidate.gclid
      ? { gclid: candidate.gclid }
      : candidate.gbraid
        ? { gbraid: candidate.gbraid }
        : { wbraid: candidate.wbraid as string }),
  }
}

/**
 * Which rows Google rejected, by their position in the batch.
 *
 * This is the part that reads like success when it is wrong. A batch where
 * every single conversion was rejected still comes back HTTP 200 — the
 * failures are carried in `partialFailureError`, indexed by position in the
 * `conversions` array via `location.fieldPathElements`. Miss it and the app
 * cheerfully stamps every lead as uploaded and never sends them again.
 */
export function parsePartialFailure(data: Record<string, unknown>): Map<number, string> {
  const failed = new Map<number, string>()
  const partial = data.partialFailureError as
    | { details?: Array<Record<string, unknown>> }
    | undefined

  for (const detail of partial?.details || []) {
    const errors = (detail as { errors?: Array<Record<string, unknown>> }).errors || []
    for (const err of errors) {
      const message = String(err.message || 'Rejected')
      const elements = (
        err.location as { fieldPathElements?: Array<{ fieldName?: string; index?: number }> } | undefined
      )?.fieldPathElements
      // The index lives on the element naming the repeated field, and other
      // elements in the same path have no index at all — so take the first
      // one that has one rather than assuming a position.
      const index = elements?.find((e) => typeof e.index === 'number')?.index
      if (typeof index === 'number') failed.set(index, message)
    }
  }
  return failed
}

export interface UploadOutcome {
  ok: boolean
  attempted: number
  succeeded: number
  failed: Array<{ leadId: string; error: string }>
  error?: string
  /** True when Google was asked to validate without recording anything. */
  dryRun: boolean
}

/**
 * Send them.
 *
 * `validateOnly` asks Google to check the request and record nothing, which is
 * the only honest way to try this the first time: every rule above fails at
 * Google's end, not ours, and finding out by writing real conversions into a
 * live account is not a test, it is a mistake with a spend attached.
 */
export async function uploadBookedJobs({
  clientId,
  customerId,
  actionId,
  validateOnly,
  limit,
}: {
  clientId: string
  customerId: string
  actionId: string
  validateOnly: boolean
  limit?: number
}): Promise<UploadOutcome> {
  const candidates = await findUploadCandidates(clientId, limit)
  if (candidates.length === 0) {
    return { ok: true, attempted: 0, succeeded: 0, failed: [], dryRun: validateOnly }
  }

  const conversions = candidates.map((c) => toConversion(c, customerId, actionId))

  const result = await adsPost(customerId, 'uploadClickConversions', {
    conversions,
    // Required to be true by the API; without it one bad row rejects the whole
    // batch, and with it the good rows still land.
    partialFailure: true,
    validateOnly,
  })

  if (!result.ok) {
    return {
      ok: false,
      attempted: candidates.length,
      succeeded: 0,
      failed: [],
      error: result.error,
      dryRun: validateOnly,
    }
  }

  const failedByIndex = parsePartialFailure(result.data)

  const failed: Array<{ leadId: string; error: string }> = []
  const succeededIds: string[] = []
  candidates.forEach((candidate, index) => {
    const error = failedByIndex.get(index)
    if (error) failed.push({ leadId: candidate.leadId, error })
    else succeededIds.push(candidate.leadId)
  })

  // A dry run must leave no trace, or the next real run would skip everything
  // it just pretended to send.
  if (!validateOnly) {
    const now = new Date()
    await Promise.all([
      succeededIds.length
        ? prisma.lead.updateMany({
            where: { id: { in: succeededIds } },
            data: { adsUploadedAt: now, adsUploadError: null },
          })
        : Promise.resolve(null),
      ...succeededIds.map((id) => {
        const value = candidates.find((c) => c.leadId === id)?.value
        return value != null
          ? prisma.lead.update({ where: { id }, data: { adsUploadedValue: value } })
          : Promise.resolve(null)
      }),
      ...failed.map((f) =>
        prisma.lead.update({
          where: { id: f.leadId },
          data: { adsUploadError: f.error.slice(0, 500) },
        })
      ),
    ]).catch((err) => console.error('[Ads offline] Could not record upload state:', err))
  }

  return {
    ok: true,
    attempted: candidates.length,
    succeeded: succeededIds.length,
    failed,
    dryRun: validateOnly,
  }
}
