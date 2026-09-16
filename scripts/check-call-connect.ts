/**
 * Which missed call is OUR fault, and which is the shop's phone.
 *
 * Run: npx tsx scripts/check-call-connect.ts
 *
 * THE COMPLAINT THAT STARTED THIS: a shop got an alert headed "Missed Call —
 * Nobody picked up" and said their phone never rang. Both were true. The call
 * reached the tracking number and the forwarded leg came back `failed`, which
 * means Twilio could not place it — so nothing rang, and the alert accused
 * them of ignoring it.
 *
 * BOTH DIRECTIONS, and the eager one is the expensive direction here. `busy`,
 * `no-answer` and `canceled` are facts about the shop or the caller: a shop
 * that was on the phone, a shop that missed one, a caller who gave up. Filing
 * a finding on any of those files one against every shop that has ever been
 * busy, which is how a queue goes permanently red and people stop reading it.
 * Only `failed` is the forwarding itself not connecting.
 */

import { callOutcome, isMissedCall, MISSED_CALL_STATUSES } from '../src/lib/call-display'
import {
  FAILURE_SHARE,
  MIN_CALLS,
  evaluateCallConnect,
  type DialAttempt,
} from '../src/lib/call-connect-health'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const call = (status: string, i = 0): DialAttempt => ({
  at: new Date(Date.UTC(2026, 8, 10 + i, 17, 41)).toISOString(),
  status,
  line: '+19724397113',
})

// --- What the shop is told -------------------------------------------------

console.log('\nThe alert copy: three of four missed statuses mean it never rang')
{
  const answered = callOutcome('completed', 97)
  if (!answered.missed && answered.rang === true) pass('completed: answered, rang')
  else fail(`completed came out ${JSON.stringify(answered)}`)

  const noAnswer = callOutcome('no-answer')
  if (noAnswer.missed && noAnswer.rang === true) pass('no-answer: missed, and it DID ring')
  else fail(`no-answer came out rang=${noAnswer.rang}`)
  if (/rang and nobody picked up/i.test(noAnswer.note))
    pass('  and only this one says nobody picked up')
  else fail(`no-answer note does not say it rang: ${noAnswer.note}`)

  const busy = callOutcome('busy')
  if (busy.missed && busy.rang === false) pass('busy: missed, did NOT ring')
  else fail(`busy came out rang=${busy.rang}`)

  /* THE ONE FROM THE COMPLAINT. `failed` is our end, and the copy has to say
     so — a shop reading this has done nothing wrong, and telling them to
     answer the phone faster would be the worst sentence in the app. */
  const failed = callOutcome('failed')
  if (failed.missed && failed.rang === false) pass('failed: missed, did NOT ring')
  else fail(`failed came out rang=${failed.rang}`)
  if (/never rang/i.test(failed.note)) pass('  and says the phone never rang')
  else fail(`failed note does not say the phone never rang: ${failed.note}`)
  if (/our end/i.test(failed.note)) pass('  and says it is our end, not theirs')
  else fail(`failed note does not own the problem: ${failed.note}`)
  if (/nobody picked up/i.test(failed.note))
    fail('failed still tells the shop nobody picked up — the original bug')
  else pass('  and never says "nobody picked up"')

  const canceled = callOutcome('canceled', 8)
  if (canceled.missed && canceled.rang === null)
    pass('canceled: missed, and whether it rang is UNKNOWN rather than guessed')
  else fail(`canceled came out rang=${canceled.rang}`)
  if (/8 second/.test(canceled.note)) pass('  and names how long the caller waited')
  else fail(`canceled note lost the duration: ${canceled.note}`)

  // Not-yet-known must not read as answered OR missed.
  const pending = callOutcome(null)
  if (!pending.missed && pending.rang === null) pass('no status yet: neither, and says so')
  else fail(`a null status came out ${JSON.stringify(pending)}`)

  // Every status the rest of the app treats as missed must be covered here,
  // or a new one silently falls to the default and reads as answered.
  for (const status of MISSED_CALL_STATUSES) {
    const out = callOutcome(status)
    if (out.missed && isMissedCall(status)) continue
    fail(`${status} is in MISSED_CALL_STATUSES but callOutcome does not treat it as missed`)
  }
  pass('every MISSED_CALL_STATUSES value is handled explicitly')
}

// --- What files a finding --------------------------------------------------

console.log('\nThe check: only "failed" is the forwarding not connecting')
{
  // THE ALERT CASE. Nothing connects: ads spending, calls arriving, no phone
  // ringing, and a "missed call" lead written every time.
  const allFailed = evaluateCallConnect({
    calls: [call('failed', 0), call('failed', 1), call('failed', 2), call('failed', 3)],
    forwardTargets: ['+19725550100'],
  })
  if (allFailed.judged && allFailed.drafts.length === 1) pass('every call failed → a finding')
  else fail(`all-failed produced ${allFailed.drafts.length} drafts`)
  if (allFailed.drafts[0]?.severity === 'ALERT') pass('  at ALERT')
  else fail(`  severity was ${allFailed.drafts[0]?.severity}`)
  if (/never rang/i.test(allFailed.drafts[0]?.detail || ''))
    pass('  and the detail says the phone never rang')
  else fail('  the detail does not say the phone never rang')
  if ((allFailed.drafts[0]?.detail || '').includes('+19725550100'))
    pass('  and names the forward-to number to check first')
  else fail('  the detail does not name the forward target')

  /* THE CASES THAT MUST STAY SILENT. Each of these is a real shop having a
     normal week, and a finding on any of them is a finding on every client.

     `busy` carries one `completed` alongside it, because busy-to-EVERYTHING
     with nothing ever ringing is its own finding (see alwaysBusy) — this
     asserts that an ordinary busy week is not. The first version of this
     case was five straight busies, which the always-busy rule then caught;
     the rule was right and the fixture was the thing that had to change. */
  for (const status of ['no-answer', 'busy', 'canceled', 'completed']) {
    const week =
      status === 'busy'
        ? [call('busy', 0), call('busy', 1), call('busy', 2), call('completed', 3), call('busy', 4)]
        : [call(status, 0), call(status, 1), call(status, 2), call(status, 3), call(status, 4)]
    const quiet = evaluateCallConnect({ calls: week, forwardTargets: ['+19725550100'] })
    if (quiet.drafts.length === 0 && quiet.judged)
      pass(`${status} × 5: judged, no finding`)
    else fail(`${status} filed ${quiet.drafts.length} findings — it would fire on every shop`)
  }

  // A shop that misses a lot of calls is a coaching conversation, not a
  // plumbing fault. Mixed real statuses, no failures: silent.
  const missesLots = evaluateCallConnect({
    calls: [call('no-answer', 0), call('no-answer', 1), call('busy', 2), call('canceled', 3), call('completed', 4)],
    forwardTargets: ['+19725550100'],
  })
  if (missesLots.drafts.length === 0) pass('a shop missing most calls files nothing here')
  else fail('a shop that simply misses calls got a forwarding finding')

  // One stray failure among many is a carrier moment.
  const stray = evaluateCallConnect({
    calls: [call('failed', 0), call('completed', 1), call('completed', 2), call('no-answer', 3), call('completed', 4)],
    forwardTargets: ['+19725550100'],
  })
  if (stray.drafts.length === 0 && stray.judged)
    pass(`1 failure in 5 (under ${FAILURE_SHARE}) is judged and silent`)
  else fail(`a single stray failure filed ${stray.drafts.length} findings`)

  // Past the share, it is a fault rather than luck — but not the ALERT case.
  const half = evaluateCallConnect({
    calls: [call('failed', 0), call('failed', 1), call('failed', 2), call('completed', 3)],
    forwardTargets: ['+19725550100'],
  })
  if (half.drafts.length === 1 && half.drafts[0].severity === 'REVIEW')
    pass('3 of 4 failing is a REVIEW, not an ALERT — some calls do connect')
  else
    fail(`3-of-4 came out ${half.drafts.length} drafts at ${half.drafts[0]?.severity}`)

  /* A QUIET WEEK MUST NOT RESOLVE A LIVE FINDING. judged:false keeps the
     check out of the run's resolve set — the same rule call-recording-health
     records, and the reason a finding survives a fortnight of no calls. */
  const quiet = evaluateCallConnect({ calls: [call('failed', 0)], forwardTargets: [] })
  if (!quiet.judged && quiet.drafts.length === 0)
    pass(`under ${MIN_CALLS} calls: NOT judged, so nothing auto-resolves`)
  else fail(`a single call was judged=${quiet.judged} with ${quiet.drafts.length} drafts`)

  const none = evaluateCallConnect({ calls: [], forwardTargets: ['+19725550100'] })
  if (!none.judged) pass('no calls at all: not judged')
  else fail('a week with no calls was judged, which would resolve a live finding')

  // A row whose outcome never arrived is not a failure — it is a row we
  // cannot judge, and counting it as fine would be the same mistake inverted.
  const unknown = evaluateCallConnect({
    calls: [call('', 0), call('', 1), call('', 2), call('failed', 3)],
    forwardTargets: [],
  })
  if (!unknown.judged) pass('rows with no status are not counted as calls')
  else fail('blank statuses were counted, so one real failure looked like a quarter')
}

// --- The day that produced this check -------------------------------------

console.log("\nNorthStar's real day, from the runtime logs")
{
  /* VERBATIM from the Vercel logs for 16 September 2026. Four calls to
     +14699495188, forwarding to +12149274145:
       09:19 CDT  no-answer  (status 26s after the dial — it RANG)
       12:41 CDT  busy       (1s)
       12:42 CDT  busy       (2s)
       12:42 CDT  busy       (1s)
     One customer, three attempts inside 90 seconds, engaged every time. The
     9:19 no-answer is the proof the line is reachable, and it is the reason
     this has to stay SILENT: a busy lunchtime is not a fault. */
  const realDay = evaluateCallConnect({
    calls: [
      { at: '2026-09-16T14:19:06Z', status: 'no-answer', line: '+14699495188' },
      { at: '2026-09-16T17:41:52Z', status: 'busy', line: '+14699495188' },
      { at: '2026-09-16T17:42:22Z', status: 'busy', line: '+14699495188' },
      { at: '2026-09-16T17:42:54Z', status: 'busy', line: '+14699495188' },
    ],
    forwardTargets: ['+12149274145'],
  })
  if (realDay.judged && realDay.drafts.length === 0)
    pass('three busy calls with one that rang: judged, and silent')
  else
    fail(`NorthStar's real day filed ${realDay.drafts.length} findings — it would fire on a busy lunchtime`)

  /* THE SAME SHAPE WITH NOTHING EVER RINGING is the case nothing reported. A
     line busy to everything for a week is rejecting calls, not engaged on
     them — and the shop is told they missed every one. */
  const neverRings = evaluateCallConnect({
    calls: [
      { at: '2026-09-10T14:00:00Z', status: 'busy', line: '+14699495188' },
      { at: '2026-09-11T15:00:00Z', status: 'busy', line: '+14699495188' },
      { at: '2026-09-12T16:00:00Z', status: 'busy', line: '+14699495188' },
      { at: '2026-09-13T17:00:00Z', status: 'busy', line: '+14699495188' },
    ],
    forwardTargets: ['+12149274145'],
  })
  if (neverRings.drafts.length === 1 && neverRings.drafts[0].severity === 'REVIEW')
    pass('busy to everything, never once ringing: a REVIEW finding')
  else
    fail(`always-busy came out ${neverRings.drafts.length} drafts at ${neverRings.drafts[0]?.severity}`)
  if ((neverRings.drafts[0]?.detail || '').includes('+12149274145'))
    pass('  and names the number to ring and listen to')
  else fail('  the detail does not name the forward target')

  // ONE call that connects is enough to prove the line works.
  const oneGoodCall = evaluateCallConnect({
    calls: [
      { at: '2026-09-10T14:00:00Z', status: 'busy', line: '+1' },
      { at: '2026-09-11T15:00:00Z', status: 'busy', line: '+1' },
      { at: '2026-09-12T16:00:00Z', status: 'busy', line: '+1' },
      { at: '2026-09-13T17:00:00Z', status: 'completed', line: '+1' },
    ],
    forwardTargets: [],
  })
  if (oneGoodCall.drafts.length === 0)
    pass('one connected call proves the line works — silent again')
  else fail('a week with one good call still filed an always-busy finding')
}

console.log(
  failures === 0
    ? '\nAll call-connect checks passed.'
    : `\n${failures} call-connect check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
