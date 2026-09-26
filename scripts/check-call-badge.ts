/**
 * What a call shows as in the leads lists and the coaching report.
 *
 * Run: npx tsx scripts/check-call-badge.ts
 *
 * "MISSED" MEANT TWO OPPOSITE THINGS. The coaching rating put "🙁 Missed" on
 * an ANSWERED call the model graded poorly — shorthand for "opportunities
 * were missed" — while the portal list never read `Lead.callStatus`, so a call
 * that genuinely rang out carried no marker at all. Shops read "Missed" the
 * only way it reads next to a phone icon, and the home screen's "3 missed
 * calls in the last 7 days" sent them into a list where those three were
 * unmarked and three answered ones said "Missed". Exactly backwards, on the
 * screen whose job is telling a shop who to ring back.
 *
 * So the first cases here are the collision itself, in both directions.
 */

import { callBadge, COMPETENT_SCORE } from '../src/lib/call-analysis/rating'
import { MISSED_CALL_STATUSES } from '../src/lib/call-display'
import { buildCoachingPrompt } from '../src/lib/call-analysis/coaching-prompt'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const graded = (outcome: string, score: number) =>
  callBadge({ callStatus: 'completed', durationSecs: 180, analysis: { status: 'COMPLETE', outcome, score } })

const ALL_OUTCOMES = ['booked', 'quote_sent', 'callback_scheduled', 'lost', 'info_only', 'something_new']

console.log('\nTHE COLLISION: an ANSWERED call never says "missed", whatever it scored')
{
  const offenders: string[] = []
  for (const outcome of ALL_OUTCOMES) {
    for (const score of [0, 12, 30, 49, 50, 64, 65, 70, 90, 100]) {
      const b = graded(outcome, score)
      if (b && /miss/i.test(`${b.label} ${b.detail}`)) offenders.push(`${outcome}@${score}: ${b.label}`)
    }
  }
  if (offenders.length === 0) pass('no answered call, at any outcome or score, is labelled missed')
  else fail(`answered calls still read as missed: ${offenders.join('; ')}`)
}

console.log('\nTHE OTHER HALF: a call nobody answered SAYS so')
{
  for (const status of MISSED_CALL_STATUSES) {
    const b = callBadge({ callStatus: status, durationSecs: 20 })
    if (!b) {
      fail(`${status}: no badge at all — the exact bug, a rung-out call with no marker`)
      continue
    }
    if (b.needsCallback && b.tone === 'red') pass(`${status} → "${b.label}" (red, needs a call back)`)
    else fail(`${status}: not marked as needing a call back: ${JSON.stringify(b)}`)
  }

  // no-answer is the plain case and gets the plain words the shop asked for.
  if (callBadge({ callStatus: 'no-answer' })?.label === 'Missed call') {
    pass('no-answer reads exactly "Missed call"')
  } else fail(`no-answer did not read "Missed call": ${callBadge({ callStatus: 'no-answer' })?.label}`)
}

console.log('\nFAILED IS OURS: the phone never rang, so the shop did not "miss" it')
{
  /* call-display.ts records why: a `failed` dial means the forward could not
     connect at all, and a shop told they missed it has done nothing wrong.
     Still red, because the caller still needs ringing back. */
  const b = callBadge({ callStatus: 'failed' })
  if (b && !/missed|nobody|didn.t answer/i.test(b.label)) pass(`failed → "${b?.label}"`)
  else fail(`failed blames the shop: ${b?.label}`)
  if (b && /our end/i.test(b.detail)) pass('and its detail owns it as our end')
  else fail(`failed detail does not own the fault: ${b?.detail}`)
}

console.log('\nRED MEANS "RING THEM BACK", and nothing else is red')
{
  const reds: string[] = []
  for (const outcome of ALL_OUTCOMES) {
    for (const score of [0, 40, 64, 65, 100]) {
      const b = graded(outcome, score)
      if (b?.tone === 'red' || b?.needsCallback) reds.push(`${outcome}@${score}`)
    }
  }
  if (reds.length === 0) pass('no coaching grade is red or asks for a call back')
  else fail(`coaching grades wearing the callback colour: ${reds.join(', ')}`)
}

console.log('\nNO LEAD STATES: the grade describes the CALL, never the lead')
{
  /* "In progress" read as the lead's status and went on saying so after the
     shop marked the job booked. Every label must stay true about that call a
     month later, whatever happened to the lead since. */
  const words: string[] = []
  for (const outcome of ALL_OUTCOMES) {
    for (const score of [0, 64, 65, 100]) {
      const label = graded(outcome, score)?.label || ''
      if (/in progress|pending|lost|won|sold|open/i.test(label)) words.push(`${outcome}@${score}: ${label}`)
    }
  }
  if (words.length === 0) pass('no label claims a lead state')
  else fail(`labels claiming a lead state: ${words.join('; ')}`)
}

console.log('\nBooking is the point, whatever the technique scored')
{
  for (const score of [0, 40, 100]) {
    const b = graded('booked', score)
    if (b?.kind === 'booked') pass(`booked @ ${score} → "${b.label}"`)
    else fail(`booked @ ${score} was graded instead: ${b?.label}`)
  }
}

console.log('\nA QUESTION IS NOT GRADED AS A SALE')
{
  /* The rubric is a sales rubric. "Are you open Saturday?" or "did my part
     arrive?" answered perfectly scores badly against it, and used to wear a
     red face for it. */
  for (const score of [5, 40, 90]) {
    const b = graded('info_only', score)
    if (b?.kind === 'info') pass(`info_only @ ${score} → "${b.label}", not a grade`)
    else fail(`info_only @ ${score} was graded as a sale: ${b?.label}`)
  }
}

console.log('\nTHE DISPLAY AND THE PROMPT AGREE ON WHAT "COMPETENT" MEANS')
{
  /* The prompt says a competent call belongs in the 65–80 band; the display
     split that band at 70, so a call the model had called competent was shown
     as "opportunities were missed". One constant now, read by both. */
  const atFloor = graded('lost', COMPETENT_SCORE)
  const below = graded('lost', COMPETENT_SCORE - 1)
  if (atFloor?.kind === 'well-handled') pass(`lost @ ${COMPETENT_SCORE} → "${atFloor.label}"`)
  else fail(`a call at the prompt's competent floor was not "well handled": ${atFloor?.label}`)
  if (below?.kind === 'coaching') pass(`lost @ ${COMPETENT_SCORE - 1} → "${below.label}"`)
  else fail(`a call just below competent was not "coaching tips": ${below?.label}`)

  const prompt = buildCoachingPrompt({
    transcript: { results: { utterances: [] } },
    metrics: {
      durationSeconds: 60,
      repTalkPct: 50,
      customerTalkPct: 50,
      interruptionsByRep: 0,
      longestSilenceSeconds: 2,
      repSpeakerIndex: 0,
    } as never,
    clientContext: { businessName: 'Test Glass', city: 'Austin', state: 'TX' },
  })
  if (prompt.includes(`belongs in the ${COMPETENT_SCORE}-80 range`)) {
    pass('the prompt reads the same constant')
  } else fail('the prompt no longer states the competent band from COMPETENT_SCORE')
  // The interpolation must not have changed a byte of the old wording.
  if (prompt.includes('belongs in the 65-80 range')) pass('and its text is unchanged (65-80)')
  else fail('the prompt text changed — every score going forward would shift')
}

console.log('\nNOTHING TRUE TO SAY, SAY NOTHING')
{
  /* A badge is a claim. A form lead, a phone lead that predates callStatus,
     an answered call not yet reviewed — none of them has one to make, and a
     guess is how "missed" came to mean two things. */
  if (callBadge({}) === null) pass('a form lead has no badge')
  else fail('a form lead got a badge')
  if (callBadge({ callStatus: null }) === null) pass('an old phone lead with no callStatus is not guessed at')
  else fail('guessed an outcome for a call with no status')
  if (callBadge({ callStatus: 'completed' }) === null) pass('an answered call with no coaching yet has no badge')
  else fail('badged an answered call with nothing to say')
  if (callBadge({ callStatus: 'completed', analysis: { status: 'FAILED', outcome: null, score: null } }) === null) {
    pass('a failed analysis shows nothing rather than a guess')
  } else fail('a failed analysis produced a badge')
  const pending = callBadge({ callStatus: 'completed', analysis: { status: 'TRANSCRIBING', outcome: null, score: null } })
  if (pending?.kind === 'analysing') pass(`an analysis in flight → "${pending.label}"`)
  else fail(`an analysis in flight was not marked as such: ${pending?.label}`)
}

console.log('\nA MISSED CALL OUTRANKS ANY ANALYSIS')
{
  // Cannot normally happen — no recording, no analysis — but if a row ever
  // carries both, the call back is the thing that needs doing.
  const b = callBadge({ callStatus: 'no-answer', analysis: { status: 'COMPLETE', outcome: 'booked', score: 90 } })
  if (b?.needsCallback) pass('no-answer wins over a stray booked analysis')
  else fail(`a missed call was hidden behind an analysis: ${b?.label}`)
}

console.log('\nEvery label fits a chip on a 360px phone')
{
  const labels = new Set<string>()
  for (const s of [...MISSED_CALL_STATUSES]) labels.add(callBadge({ callStatus: s })!.label)
  for (const o of ALL_OUTCOMES) for (const sc of [0, 100]) labels.add(graded(o, sc)!.label)
  const long = [...labels].filter((l) => l.length > 22)
  if (long.length === 0) pass(`all ${labels.size} labels ≤ 22 characters: ${[...labels].join(' | ')}`)
  else fail(`too long for a chip: ${long.join(', ')}`)
}

console.log(
  failures === 0
    ? '\nAll call-badge checks passed.'
    : `\n${failures} call-badge check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
