import type { FindingDraft } from '@/lib/google-ads-checks'

/**
 * ARE THE FORWARDED CALLS REACHING THE SHOP'S PHONE AT ALL?
 *
 * WHY THIS IS A CHECK OF ITS OWN. A shop reported a "Missed Call" alert for a
 * call their phone never rang for. Both halves were true: the call arrived on
 * the tracking number, and nothing rang. Twilio's `DialCallStatus` tells the
 * two apart — `no-answer` means it rang for the full timeout, while `failed`
 * means the call could not be placed to `forwardTo` at all — and this app
 * treated all four missed statuses identically, so nothing anywhere noticed.
 *
 * IT IS THE `<Dial record>` FAILURE WITH A WRONG ROW INSTEAD OF NO ROW, WHICH
 * IS WORSE. A `forwardTo` that can never connect — a number changed at the
 * shop and not here, a disconnected line, a carrier rejection, a geo
 * permission — still produces a lead, still sends the alert, still counts in
 * the monthly report. Nothing is absent, so nothing looks wrong: the paid
 * clicks keep arriving, the phone never rings, and the report tells the shop
 * every month that they missed every call. They are the only ones who can see
 * it, and what they see is us blaming them.
 *
 * ONLY `failed` IS OURS. The others are facts about the shop or the caller and
 * must never file a finding:
 *
 * - `no-answer` — it rang and nobody answered. That is the missed-call
 *   coaching conversation, not a fault in the plumbing.
 * - `busy` — a real engaged line.
 * - `canceled` — the caller hung up while it was ringing. Impatient callers
 *   are not a misconfiguration, and a shop with a slow pickup will have many.
 *
 * Firing on any of those would file a finding against every shop that has ever
 * been busy, which is how an account goes permanently red and people stop
 * reading the queue.
 */

export const CONNECT_CHECK = 'calls-not-connecting'

/** Recent enough to be actionable, long enough to have calls in it. */
export const WINDOW_DAYS = 7

/**
 * Below this, one bad carrier moment reads as a broken line.
 *
 * Deliberately low, because the ALERT case is a number that connects NONE of
 * its calls — and a shop with three calls a week all failing is exactly the
 * client this exists for. The share threshold protects the middle.
 */
export const MIN_CALLS = 3

/** Above this share of failures, something is wrong rather than unlucky. */
export const FAILURE_SHARE = 0.5

export interface DialAttempt {
  /** ISO, so a finding can name the call that proves it. */
  at: string
  /** Twilio's DialCallStatus. */
  status: string
  /** Which of the client's tracking numbers was dialled. */
  line: string | null
}

export interface CallConnectInput {
  /** Calls through THIS app's TwiML in the window, with a known outcome. */
  calls: DialAttempt[]
  /** Where the active numbers forward to, for the finding's detail. */
  forwardTargets: string[]
}

/**
 * Returns the drafts AND whether this client could be judged.
 *
 * `judged: false` keeps the check out of the run's resolve set — a week with
 * two calls must not auto-resolve a finding that is still true, which is the
 * same rule `call-recording-health.ts` records for a quiet week.
 */
export function evaluateCallConnect(input: CallConnectInput): {
  judged: boolean
  drafts: FindingDraft[]
} {
  const known = input.calls.filter((c) => !!c.status)
  if (known.length < MIN_CALLS) return { judged: false, drafts: [] }

  const failed = known.filter((c) => c.status === 'failed')
  if (failed.length === 0) return { judged: true, drafts: [] }

  const share = failed.length / known.length
  // A stray failure is a carrier moment, not a broken line.
  if (share < FAILURE_SHARE) return { judged: true, drafts: [] }

  const none = failed.length === known.length
  const lines = [...new Set(failed.map((c) => c.line).filter(Boolean))] as string[]
  const targets = input.forwardTargets.filter(Boolean)

  return {
    judged: true,
    drafts: [
      {
        check: CONNECT_CHECK,
        /* ALERT when nothing connects: the ads are spending, the calls are
           arriving, and no phone is ringing. Every hour of this is paid
           clicks landing on a line that cannot be reached — and unlike a
           missing recording, the shop is also being told it is their fault. */
        severity: none ? 'ALERT' : 'REVIEW',
        entity: 'call-forwarding',
        title: none
          ? `None of the last ${known.length} calls could be connected to their phone`
          : `${failed.length} of ${known.length} calls could not be connected to their phone`,
        detail:
          (none
            ? `Every one of the ${known.length} calls to their tracking number${
                known.length === 1 ? '' : 's'
              } in the last ${WINDOW_DAYS} days came back "failed" — Twilio could not place the forwarded call at all, so their phone never rang. `
            : `${failed.length} of ${known.length} calls in the last ${WINDOW_DAYS} days came back "failed", meaning Twilio could not place the forwarded leg and the phone did not ring. `) +
          `"failed" is not a missed call: no-answer means it rang and nobody picked up, and this is the forwarding itself not connecting. ` +
          `Check the forward-to number on their tracking numbers first${
            targets.length ? ` — currently ${targets.join(', ')}` : ''
          }: a line changed at the shop and not here fails exactly like this. Then the Twilio debugger for these calls, for a carrier rejection or a geo-permission block. ` +
          `NOTHING ELSE REPORTS THIS. A failed forward still writes a lead, still sends the "missed call" alert and still counts in their monthly report, so the only person who can see it is the shop — and what they see is us telling them they missed calls that never reached them.`,
        evidence: {
          windowDays: WINDOW_DAYS,
          calls: known.length,
          failed: failed.length,
          byStatus: known.reduce<Record<string, number>>((acc, c) => {
            acc[c.status] = (acc[c.status] || 0) + 1
            return acc
          }, {}),
          lines,
          forwardTargets: targets,
          firstFailedAt: failed[0]?.at ?? null,
          lastFailedAt: failed[failed.length - 1]?.at ?? null,
        },
      },
    ],
  }
}
