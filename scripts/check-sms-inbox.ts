/**
 * Reading an inbound text: the media, and what is not an enquiry.
 *
 *   npx tsx scripts/check-sms-inbox.ts
 *
 * WHY THIS IS WORTH A SCRIPT. The hosted sites have been telling customers to
 * text a photo of the damage, and until the SMS webhook existed every one of
 * those texts was swallowed: the tracking numbers were bought with a VoiceUrl
 * and nothing else, so Twilio had no instruction for a message. Nothing
 * errored, no row was missing from anywhere it was expected, and the customer
 * believed they had sent it — the same shape of invisible absence as the
 * `<Dial record>` typo.
 *
 * Now that the texts land, the two things that can go wrong quietly are both
 * in here:
 *
 * - THE MEDIA READER. Twilio numbers its media `MediaUrl0`, `MediaUrl1`, and
 *   `NumMedia` is a STRING. Read it wrong and a photo is dropped with nothing
 *   to show that one was ever attached.
 * - THE OPT-OUT MATCH. "STOP" is an opt-out; "stop by tomorrow and I will
 *   show you the crack" is an enquiry, and the most useful one of the day.
 *   Matching loosely throws away a lead and matching not at all files one
 *   against somebody who asked to be left alone.
 *
 * The webhook and the lead attachment reach the database and Twilio, so they
 * are verified by posting real signed requests at a running server; what is
 * asserted here is the pure half.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import { mediaFromParams, isRenderableImage, isOptOut } from '@/lib/twilio-sms'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

console.log('--- reading the media off the webhook body ---')
{
  check('no media', mediaFromParams({ NumMedia: '0' }).length === 0)
  check('a missing NumMedia is none', mediaFromParams({}).length === 0)

  const one = mediaFromParams({
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/x/Media/ME1',
    MediaContentType0: 'image/jpeg',
  })
  check('one photo', one.length === 1 && one[0].contentType === 'image/jpeg')

  // NumMedia is a STRING in the form body, like every other Twilio field.
  const three = mediaFromParams({
    NumMedia: '3',
    MediaUrl0: 'https://x/0',
    MediaContentType0: 'image/jpeg',
    MediaUrl1: 'https://x/1',
    MediaContentType1: 'image/png',
    MediaUrl2: 'https://x/2',
    MediaContentType2: 'image/heic',
  })
  check('three, in order', three.map((m) => m.url).join(',') === 'https://x/0,https://x/1,https://x/2')

  // Twilio allows ten. A count beyond that is not something to trust.
  const many: Record<string, string> = { NumMedia: '40' }
  for (let i = 0; i < 40; i++) {
    many[`MediaUrl${i}`] = `https://x/${i}`
    many[`MediaContentType${i}`] = 'image/jpeg'
  }
  check('capped at ten', mediaFromParams(many).length === 10, String(mediaFromParams(many).length))

  // A gap in the middle is Twilio telling us something; the entries that ARE
  // there still come through rather than the whole message losing its media.
  const gapped = mediaFromParams({
    NumMedia: '3',
    MediaUrl0: 'https://x/0',
    MediaContentType0: 'image/jpeg',
    MediaUrl2: 'https://x/2',
    MediaContentType2: 'image/jpeg',
  })
  check('a gap does not cost the rest', gapped.length === 2, JSON.stringify(gapped))

  // No content type at all: kept, because the photo is still a photo and a
  // dropped one is invisible.
  const typeless = mediaFromParams({ NumMedia: '1', MediaUrl0: 'https://x/0' })
  check('a missing content type still keeps the item', typeless.length === 1)
  check('and is not treated as an image', !isRenderableImage(typeless[0].contentType))
}

console.log('\n--- which of them a browser and an email will render ---')
{
  for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/avif']) {
    check(`${type} renders`, isRenderableImage(type))
  }
  // iPhones send HEIC with a charset sometimes; the parameter is not the type.
  check('a content type with parameters', isRenderableImage('image/jpeg; charset=binary'))
  check('case does not matter', isRenderableImage('IMAGE/JPEG'))
  // A video IS worth storing and showing as a link — it is simply not the
  // thing the email can put in front of somebody.
  check('video does not render', !isRenderableImage('video/mp4'))
  check('a PDF does not render', !isRenderableImage('application/pdf'))
  check('octet-stream does not render', !isRenderableImage('application/octet-stream'))
  check('empty does not render', !isRenderableImage(''))
}

console.log('\n--- an opt-out is not an enquiry, and an enquiry is not an opt-out ---')
{
  for (const word of ['STOP', 'stop', ' Stop ', 'STOPALL', 'unsubscribe', 'CANCEL', 'End', 'quit', 'opt out', 'STOP.']) {
    check(`"${word}" is an opt-out`, isOptOut(word))
  }

  // THE TRAPS. Every one of these is a real enquiry and the best kind: they
  // are texting because the site told them to.
  const enquiries = [
    'stop by tomorrow and I will show you the crack',
    'Can you stop at my office? Here is the photo',
    'I need to stop the crack spreading',
    'Please cancel my appointment on Tuesday and book Wednesday',
    'quit sure how big it is, photo attached',
    'end of the windshield on the passenger side',
    'STOP THE CRACK FROM SPREADING PLEASE',
  ]
  for (const text of enquiries) {
    check(`not an opt-out: "${text.slice(0, 44)}"`, !isOptOut(text))
  }

  // A photo with no words at all is the commonest MMS there is, and it must
  // never read as an opt-out.
  check('an empty body is not an opt-out', !isOptOut(''))
  check('and neither is undefined', !isOptOut(undefined))
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
