/**
 * Calls that were answered on a number set to record, and were not recorded.
 *
 * WHY THIS EXISTS. For months every call through a tracking number bought in
 * this app was dialled with `record="record-from-answering-dual"` — one letter
 * off the value Twilio documents — and Twilio ignores an attribute it cannot
 * parse rather than refusing the call. So the default `do-not-record` applied
 * and nothing was ever recorded, while EVERY OTHER PART OF THE FEATURE
 * behaved perfectly: the caller reached the shop, the status callback fired,
 * the lead was written, the alert email went out. No recording meant no
 * recording callback, which meant no analysis row, which meant nothing
 * anywhere read as an error. There was only an absence — and an absence of
 * scored calls is indistinguishable from a client nobody has got to yet.
 *
 * `scripts/check-twiml.ts` stops that exact string coming back. This is the
 * check for the NEXT cause: a rotated credential, a Blob write failing, a
 * signature rejection, a number reconfigured by hand in Twilio's console.
 * Every one of them looks identical from inside the app, and every one of
 * them is losing audio that cannot be recovered afterwards.
 *
 * Pure: counts in, findings out. No database and no network, so the
 * thresholds can be checked against made-up weeks without a client.
 */

import type { FindingDraft } from '@/lib/google-ads-checks'

export const RECORDING_CHECK = 'calls-not-recorded'

/** The week is the window. Long enough to have calls, short enough to act on. */
export const WINDOW_DAYS = 7

/**
 * A recording arrives a minute or two AFTER the call, so a call that ended
 * moments ago is still settling rather than missing. An hour is generous on
 * purpose: filing a finding against a recording that is on its way is how a
 * check teaches people to ignore it.
 */
export const SETTLE_MINUTES = 60

/**
 * Under ten seconds Twilio may legitimately produce nothing, and a
 * conversation that short is not one the coaching would have anything to say
 * about either.
 */
export const MIN_SECONDS = 10

/**
 * One unrecorded call proves nothing — a caller can hang up as the bridge
 * completes. Two is a pattern worth a shop owner's attention.
 */
export const MIN_ANSWERED = 2

/** Below this share, treat it as the odd call rather than a broken feature. */
export const PARTIAL_SHARE = 0.34

export interface AnsweredCall {
  /** When the call came in, ISO. Named in the finding so it can be found. */
  at: string
  seconds: number
  recorded: boolean
}

export interface CallRecordingInput {
  /** True when at least one ACTIVE tracking number is set to record. */
  recordingEnabled: boolean
  /** Context only — coaching off explains missing SCORES, not missing audio. */
  coachingEnabled: boolean
  /** Answered calls in the window, already past the settle time. */
  calls: AnsweredCall[]
}

/**
 * Returns the drafts AND whether this client could be judged at all.
 *
 * The second half is the part that is easy to leave out and expensive to get
 * wrong. `judged: false` keeps the check out of the run's resolve set, so a
 * quiet week — no calls, or recording deliberately switched off — cannot
 * auto-resolve a finding that is still true. Same rule the ads checks follow
 * for an API that failed: not seeing a problem is not the same as the problem
 * being fixed.
 */
export function evaluateCallRecording(input: CallRecordingInput): {
  judged: boolean
  drafts: FindingDraft[]
} {
  if (!input.recordingEnabled) return { judged: false, drafts: [] }

  const answered = input.calls.length
  if (answered < MIN_ANSWERED) return { judged: false, drafts: [] }

  const missing = input.calls.filter((c) => !c.recorded)
  const recorded = answered - missing.length
  if (missing.length === 0) return { judged: true, drafts: [] }
  if (recorded > 0 && missing.length / answered < PARTIAL_SHARE) {
    // A handful out of many is normal attrition, not a fault. Judged, so an
    // older finding resolves.
    return { judged: true, drafts: [] }
  }

  const none = recorded === 0
  const minutes = Math.round(missing.reduce((sum, c) => sum + c.seconds, 0) / 60)
  const oldest = missing[0]?.at ?? null

  return {
    judged: true,
    drafts: [
      {
        check: RECORDING_CHECK,
        /* ALERT even though no money is burning tonight. Everything else this
           sweep files can be read tomorrow and fixed with the same result;
           audio cannot. Every day this stays true is another day of calls
           that can never be recovered, scored, or listened to. */
        severity: none ? 'ALERT' : 'REVIEW',
        entity: 'call-recording',
        title: none
          ? `No call has been recorded in ${WINDOW_DAYS} days (${answered} answered)`
          : `${missing.length} of ${answered} answered calls were not recorded`,
        detail:
          (none
            ? `Recording is switched on, ${answered} calls were answered in the last ${WINDOW_DAYS} days, and not one of them produced a recording. `
            : `Recording is switched on and ${recorded} of ${answered} answered calls in the last ${WINDOW_DAYS} days were recorded; ${missing.length} were not. `) +
          `That is about ${minutes} minute${minutes === 1 ? '' : 's'} of conversation with no audio, no transcript and no coaching score` +
          (input.coachingEnabled ? '' : ' (coaching is off for this client, so only the audio is affected)') +
          `. Nothing else reports this: a call that is never recorded still forwards, still writes a lead and still sends the alert. ` +
          `Check the TwiML the voice webhook returns, then the Twilio debugger for warnings on these calls, then that the recording webhook is being reached. ` +
          `Recordings cannot be fetched afterwards — a call that was not recorded is gone.`,
        evidence: {
          windowDays: WINDOW_DAYS,
          answered,
          recorded,
          missing: missing.length,
          missingMinutes: minutes,
          oldestMissingAt: oldest,
          coachingEnabled: input.coachingEnabled,
          settleMinutes: SETTLE_MINUTES,
          minSeconds: MIN_SECONDS,
          // Enough to look up the calls in Twilio, not the whole week.
          sample: missing.slice(0, 5).map((c) => ({ at: c.at, seconds: c.seconds })),
        },
      },
    ],
  }
}
