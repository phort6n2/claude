/**
 * Does the TwiML we hand Twilio actually say what we think it says?
 *
 *   npx tsx scripts/check-twiml.ts
 *
 * WHY THIS IS WORTH A SCRIPT. This document is the single output of the whole
 * call-tracking feature that nothing in this codebase ever reads back. Twilio
 * fetches it, acts on it, and returns nothing — so a wrong attribute cannot
 * fail a build, cannot throw, cannot 500, and never appears in a log.
 *
 * AND TWILIO DOES NOT REJECT WHAT IT CANNOT PARSE. An attribute value outside
 * the documented set is warned about in the account debugger, dropped, and
 * the call proceeds on the default. For `record` that default is
 * `do-not-record`, which is how this app spent months dialling with
 * `record-from-answering-dual` — one letter off `record-from-answer-dual` —
 * and recording nothing at all. Every other part of the feature behaved
 * perfectly: the caller reached the shop, the status callback fired, the lead
 * was written, the alert email went out. There was simply never a recording,
 * so there was never a recording callback, so there was never an analysis
 * row. Nothing was wrong anywhere; something was just absent, and an absence
 * of scored calls looks exactly like a client nobody has got to yet.
 *
 * It took a shop having a ten-minute conversation and somebody going looking
 * for the recording of a call they KNEW had happened.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * generates the real TwiML and exits non-zero when it is wrong.
 */
import {
  dialTwiml,
  DIAL_RECORD,
  DIAL_RECORD_VALUES,
  type DialPlan,
} from '@/lib/twilio-voice'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const BASE: DialPlan = {
  callerId: '+17144127174',
  forwardTo: '+17144220921',
  record: true,
  announce: false,
  whisper: false,
  statusUrl: 'https://app.example.com/api/webhooks/twilio/status',
  recordingUrl: 'https://app.example.com/api/webhooks/twilio/recording',
  whisperUrl: 'https://app.example.com/api/webhooks/twilio/whisper?number=abc',
}
const plan = (over: Partial<DialPlan> = {}): DialPlan => ({ ...BASE, ...over })

console.log('--- the record attribute, which Twilio silently ignores when wrong ---')
check(
  `the value we send is one Twilio documents: "${DIAL_RECORD}"`,
  (DIAL_RECORD_VALUES as readonly string[]).includes(DIAL_RECORD),
  `not in ${DIAL_RECORD_VALUES.join(', ')}`
)
// The exact string that broke it. Named here so a "tidy-up" that reintroduces
// it fails loudly instead of quietly recording nothing for another month.
check(
  'the misspelling that caused this is not what we send',
  DIAL_RECORD !== ('record-from-answering-dual' as string)
)
check('it is dual-channel, or the transcript cannot tell the two speakers apart', /-dual$/.test(DIAL_RECORD))
check('it records from ANSWER, not from ringing', DIAL_RECORD.startsWith('record-from-answer'))

{
  const xml = dialTwiml(plan())
  const value = /record="([^"]*)"/.exec(xml)?.[1]
  check(`the emitted TwiML carries it: record="${value}"`, value === DIAL_RECORD, xml)
}

console.log('\n--- recording asks for a callback, or nothing is ever analysed ---')
{
  const xml = dialTwiml(plan())
  check('recordingStatusCallback points at our recording webhook', xml.includes(`recordingStatusCallback="${BASE.recordingUrl}"`), xml)
  check('the event asked for is one Twilio documents', /recordingStatusCallbackEvent="(in-progress|completed|absent)"/.test(xml), xml)
  check('the callback is POSTed, which is what that route accepts', xml.includes('recordingStatusCallbackMethod="POST"'), xml)
}

console.log('\n--- recording off means no recording attributes at all ---')
{
  const xml = dialTwiml(plan({ record: false }))
  check('no record attribute', !/\brecord=/.test(xml), xml)
  check('no recording callback either', !xml.includes('recordingStatusCallback'), xml)
  // A callback for a recording that will never exist is not harmless: it is a
  // URL on a public endpoint doing nothing, and it reads to the next person
  // as if recording were on.
  check('the call still connects', xml.includes('<Dial ') && xml.includes(BASE.forwardTo), xml)
}

console.log('\n--- the announcement follows the toggle, both of them ---')
{
  const say = 'This call may be recorded'
  check('recording on + announce on says it', dialTwiml(plan({ announce: true })).includes(say))
  check('recording on + announce off stays quiet', !dialTwiml(plan()).includes(say))
  // The shop turned recording off; announcing it anyway would be a false
  // statement to a member of the public.
  check(
    'recording off never announces, whatever the announce flag says',
    !dialTwiml(plan({ record: false, announce: true })).includes(say)
  )
}

console.log('\n--- the rest of the dial ---')
{
  const xml = dialTwiml(plan())
  check('answerOnBridge, so the caller hears real ringing', xml.includes('answerOnBridge="true"'))
  check('the action URL is the status webhook', xml.includes(`action="${BASE.statusUrl}"`))
  check('no whisper URL when the number has no whisper', !xml.includes('whisper?number'), xml)
  const whispered = dialTwiml(plan({ whisper: true }))
  // &amp; inside an attribute, not a bare &, or the document is not XML.
  check('a whisper URL is escaped into the Number tag', /<Number url="[^"]*whisper\?number=abc"/.test(whispered), whispered)
}

console.log('\n--- it has to be well-formed XML, or Twilio plays an error to a customer ---')
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${dialTwiml(
    plan({ announce: true, whisper: true, forwardTo: '+1714422 &<>"0921' })
  )}</Response>`
  const bare = xml.replace(/&(amp|lt|gt|quot|apos);/g, '')
  check('every & is escaped', !bare.includes('&'), xml)
  const tags = xml.match(/<\/?(Response|Dial|Number|Say)\b/g) ?? []
  const opens = tags.filter((t) => !t.startsWith('</')).length
  check('tags balance', opens * 2 === tags.length, tags.join(' '))
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
