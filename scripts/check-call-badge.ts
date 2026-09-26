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

import {
  callBadge,
  COMPETENT_SCORE,
  BOOKED_SCORE_FLOOR,
  FOCUS_AREAS,
  normalizeRepName,
  settleAnalysis,
} from '../src/lib/call-analysis/rating'
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
}

console.log('\nTHE GRADER\'S RULES: praise for a booking, no claims, adult feedback')
{
  const prompt = buildCoachingPrompt({
    transcript: { results: { utterances: [] } },
    metrics: {
      durationSeconds: 60, repTalkPct: 50, customerTalkPct: 50,
      interruptionsByRep: 0, longestSilenceSeconds: 2, repSpeakerIndex: 0,
    } as never,
    clientContext: { businessName: 'Test Glass', city: 'Austin', state: 'TX' },
  })

  /* §2: the rubric paid 10 points for "certified techs, OEM glass", so a shop
     without them could only score by saying something untrue. The words may
     appear only inside the instruction NOT to deduct for them. */
  const creditLine = prompt.split('\n').find((l) => /\(10\)/.test(l) && /shop/i.test(l)) || ''
  if (!/certified|OEM/i.test(creditLine)) pass('the 10-point value line lists no claims to make')
  else fail(`the rubric still pays for specific claims: ${creditLine}`)
  if (/NEVER deduct for a\s+particular claim being absent/.test(prompt)) pass('and says never to deduct for a missing claim')
  else fail('nothing stops the grader deducting for a credential the shop may not have')
  if (!/certified techs/i.test(FOCUS_AREAS.value_differentiators)) {
    pass(`the focus label names no claim: "${FOCUS_AREAS.value_differentiators}"`)
  } else fail(`the focus label still coaches a claim: ${FOCUS_AREAS.value_differentiators}`)

  if (prompt.includes(`score it ${BOOKED_SCORE_FLOOR} or above`)) pass(`a booked call is floored at ${BOOKED_SCORE_FLOOR}`)
  else fail('the prompt does not state the booked floor from BOOKED_SCORE_FLOOR')
  if (/praise only/i.test(prompt) && /no tip in the note/i.test(prompt)) pass('a booked call gets a praise-only note')
  else fail('a booked call can still be handed a criticism in its headline note')

  if (/not a sales call|FIRST, IS THIS A SALES CALL/i.test(prompt) && /do NOT grade them against the sales rubric/.test(prompt)) {
    pass('question-only calls are not graded against the sales rubric')
  } else fail('the grader still scores a parts query as a failed sale')

  // The research, as rules the model can follow.
  if (/About the CALL, never the person/.test(prompt)) pass('feedback is about the call, never the person')
  else fail('nothing keeps feedback off the person')
  if (/"but" or "however"/.test(prompt)) pass('praise is not a warm-up for a "but"')
  else fail('the grader may still sandwich praise around criticism')
  if (/Tips look FORWARD/.test(prompt)) pass('tips are forward-looking')
  else fail('tips are not asked to look forward')

  if (/rep_name/.test(prompt) && /never the customer's name, never a guess/.test(prompt)) {
    pass('rep_name is only what the rep says about themselves')
  } else fail('rep_name is not restricted to the rep\'s own introduction')
}

console.log('\nThe prompt\'s rules are ENFORCED, not just asked for')
{
  const low = settleAnalysis({ score: 52, outcome: 'booked', rep_name: 'mike' })
  if (low.score === BOOKED_SCORE_FLOOR) pass(`a booked call scored 52 is stored as ${BOOKED_SCORE_FLOOR}`)
  else fail(`a booked call kept a score below the floor: ${low.score}`)
  const high = settleAnalysis({ score: 93, outcome: 'booked' })
  if (high.score === 93) pass('a booked call above the floor keeps its score')
  else fail(`a high booked score was flattened: ${high.score}`)
  const lost = settleAnalysis({ score: 41, outcome: 'lost' })
  if (lost.score === 41) pass('the floor applies to booked calls only')
  else fail(`the floor lifted a call that did not book: ${lost.score}`)
  if (low.rep_name === 'Mike') pass('the rep name is tidied: "mike" → "Mike"')
  else fail(`rep name not normalised: ${low.rep_name}`)
}

console.log('\nRep names: only something that is plausibly a first name')
{
  const cases: Array<[unknown, string | null]> = [
    ['Mike', 'Mike'], ['mike', 'Mike'], ['MIKE', 'Mike'], ['  Mike Johnson ', 'Mike'],
    // Names keep their own shape and their accents. The first version turned
    // "José" into "Jos" and "O'Neil" into "O'neil" — and this list asserted
    // the mangled forms, which is how a check ends up guarding a bug.
    ["O'Neil", "O'Neil"], ['McKenzie', 'McKenzie'], ['José', 'José'], ['Maria-José', 'Maria-José'],
    ['zoë', 'Zoë'], ['Mike,', 'Mike'],
    [null, null], ['', null], ['unknown', null], ['N/A', null], ['Rep', null], ['x', null], [42, null],
  ]
  const bad = cases.filter(([raw, want]) => normalizeRepName(raw) !== want)
  if (bad.length === 0) pass(`all ${cases.length} name cases read as expected`)
  else fail(`name cases wrong: ${bad.map(([r, w]) => `${JSON.stringify(r)}→${normalizeRepName(r)} (want ${w})`).join('; ')}`)
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
