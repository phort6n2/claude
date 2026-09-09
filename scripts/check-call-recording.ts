/**
 * When does the sweep say calls are not being recorded?
 *
 *   npx tsx scripts/check-call-recording.ts
 *
 * WHY THIS IS WORTH A SCRIPT. This check is the safety net for a failure that
 * produces no error anywhere — a call that is never recorded still forwards,
 * still writes a lead and still sends the alert email. So the only thing
 * standing between the next such failure and another silent month is whether
 * these thresholds fire, and there is no way to find that out by using the
 * app: you would have to break recording in production and wait a week.
 *
 * Both directions are expensive. Too eager and it fires on the ordinary call
 * where a caller hung up on the bridge, which teaches everyone to scroll past
 * it — and the one morning it is real, they will. Too shy and it stays quiet
 * through exactly the outage it exists for.
 *
 * The `judged` flag matters as much as the findings: it is what keeps a quiet
 * week from auto-resolving a finding that is still true.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real evaluator and exits non-zero when it is wrong.
 */
import {
  evaluateCallRecording,
  RECORDING_CHECK,
  MIN_ANSWERED,
  MIN_SECONDS,
  PARTIAL_SHARE,
  SETTLE_MINUTES,
  WINDOW_DAYS,
  type AnsweredCall,
} from '@/lib/call-recording-health'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const call = (recorded: boolean, seconds = 120, day = 1): AnsweredCall => ({
  at: `2026-09-0${day}T17:00:00.000Z`,
  seconds,
  recorded,
})
const run = (calls: AnsweredCall[], over: { recording?: boolean; coaching?: boolean } = {}) =>
  evaluateCallRecording({
    recordingEnabled: over.recording ?? true,
    coachingEnabled: over.coaching ?? true,
    calls,
  })

console.log('--- the outage this exists for ---')
{
  // The real one: recording on, calls answered, nothing recorded at all.
  const r = run([call(false), call(false, 601, 2), call(false, 240, 3)])
  check('three answered, none recorded -> one finding', r.drafts.length === 1, JSON.stringify(r))
  check('it is the named check', r.drafts[0]?.check === RECORDING_CHECK)
  // ALERT despite no money burning tonight: audio is the one thing this sweep
  // reports that cannot be recovered by acting tomorrow instead.
  check('severity is ALERT when nothing is recorded', r.drafts[0]?.severity === 'ALERT')
  check(`the title names the counts: "${r.drafts[0]?.title}"`, /3 answered/.test(r.drafts[0]?.title ?? ''))
  const e = r.drafts[0]?.evidence as { answered: number; missing: number; missingMinutes: number; sample: unknown[] }
  check('evidence carries the counts', e.answered === 3 && e.missing === 3)
  check(`evidence says how much audio was lost (${e.missingMinutes} min)`, e.missingMinutes === 16, JSON.stringify(e))
  check('a sample of the calls travels with it', e.sample.length === 3)
}

console.log('\n--- what must NOT fire ---')
check('every call recorded', run([call(true), call(true), call(true)]).drafts.length === 0)
{
  // One unrecorded call out of six. A caller hanging up as the bridge
  // completes produces exactly this, and it is not a fault.
  const r = run([call(false), call(true), call(true), call(true), call(true), call(true)])
  check(`1 of 6 missing (under ${Math.round(PARTIAL_SHARE * 100)}%) is not a finding`, r.drafts.length === 0)
  check('but it IS judged, so an old finding resolves', r.judged)
}
{
  const r = run([call(false)])
  check(`a single unrecorded call is not enough (min ${MIN_ANSWERED})`, r.drafts.length === 0)
  // And it must not resolve anything either: one call is not evidence of
  // health any more than it is evidence of failure.
  check('one call cannot be judged', !r.judged)
}
{
  const r = run([call(false), call(false)], { recording: false })
  check('recording switched off files nothing', r.drafts.length === 0)
  check('and is never judged, or turning it off would clear a real finding', !r.judged)
}
check('no calls at all files nothing', run([]).drafts.length === 0)
check('a quiet week is NOT an all-clear', !run([]).judged)

console.log('\n--- partial loss ---')
{
  const r = run([call(false), call(false), call(false), call(true)])
  check('3 of 4 missing is reported', r.drafts.length === 1)
  // REVIEW, not ALERT: something is recording, so this is a fault to read
  // rather than a feature that is entirely down.
  check('severity is REVIEW when some were recorded', r.drafts[0]?.severity === 'REVIEW')
  check(`title says which: "${r.drafts[0]?.title}"`, /3 of 4/.test(r.drafts[0]?.title ?? ''))
}

console.log('\n--- coaching off explains scores, not silence ---')
{
  const on = run([call(false), call(false)])
  const off = run([call(false), call(false)], { coaching: false })
  check('a finding is filed either way', on.drafts.length === 1 && off.drafts.length === 1)
  check('and the detail says coaching is off when it is', /coaching is off/.test(off.drafts[0].detail))
  check('but does not say so when it is on', !/coaching is off/.test(on.drafts[0].detail))
}

console.log('\n--- the constants themselves ---')
check(`window is ${WINDOW_DAYS} days`, WINDOW_DAYS >= 3 && WINDOW_DAYS <= 30)
// Recordings land a minute or two after the call; filing against one that is
// still on its way is how a check gets ignored.
check(`recordings are given ${SETTLE_MINUTES} minutes to arrive`, SETTLE_MINUTES >= 15)
check(`calls under ${MIN_SECONDS}s are not judged`, MIN_SECONDS >= 5 && MIN_SECONDS <= 30)
check('the partial threshold is a real fraction', PARTIAL_SHARE > 0 && PARTIAL_SHARE < 1)

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
