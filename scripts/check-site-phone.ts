/**
 * Which number does a hosted site show, and where?
 *
 *   npx tsx scripts/check-site-phone.ts
 *
 * WHY THIS IS WORTH A SCRIPT. One `phone` field was doing two opposite jobs,
 * and both are invisible when wrong.
 *
 * - INBOUND wants the TRACKING number: every "call us" link, so the call is
 *   recorded, coached and attributed. Show the shop's own line there and the
 *   calls the ads paid for arrive on a line nothing measures — no error, no
 *   missing row, just a quiet week.
 * - OUTBOUND, and anything the customer will SEE ARRIVE, wants the shop's own
 *   line. The confirmation card said "They will call from (689) 366-6860 —
 *   save the number so you do not miss it" while naming the tracking number;
 *   the shop dials back from their handset, so the call that arrives shows a
 *   different number from the one the customer was just told to save. That is
 *   the missed call the sentence exists to prevent.
 * - SMS WAS grouped with the callback and is now INBOUND, which is a
 *   deliberate reversal. Texts used to be swallowed — the numbers carried a
 *   VoiceUrl and nothing else, so Twilio had no instruction for a message. The
 *   SMS webhook exists now (`/api/webhooks/twilio/sms`), so a texted photo
 *   lands on the lead, is copied to our own storage and is attributed to the
 *   number that produced it. Texting the tracked line is the point of it.
 *
 * `withSitePhone` reaches the database, so what is asserted here is the pure
 * half — that both numbers survive the swap in every configuration, and that
 * the fallbacks collapse to the same number rather than to nothing.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import { formatPhoneDisplay } from '@/lib/lead-display'
import { smsHref, telHref } from '@/lib/contact-links'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/**
 * The shape `withSitePhone` returns, resolved without a database: the three
 * branches it has, in the order it takes them.
 */
function resolve(input: {
  phone: string
  siteDisplayPhone?: string | null
  trackingNumber?: string | null
}): { phone: string; callbackPhone: string } {
  const callbackPhone = formatPhoneDisplay(input.phone) || input.phone
  if (input.trackingNumber) {
    const display = formatPhoneDisplay(input.trackingNumber)
    if (display) return { phone: display, callbackPhone }
  }
  const external = input.siteDisplayPhone?.trim()
  if (external) return { phone: formatPhoneDisplay(external) || external, callbackPhone }
  return { phone: callbackPhone, callbackPhone }
}

const REAL = '(714) 582-1740'
const TRACKING = '+16893666860'
const EXTERNAL = '+19495551234'

console.log('--- a shop with one of our tracking numbers ---')
{
  const r = resolve({ phone: REAL, trackingNumber: TRACKING })
  check('the site SHOWS the tracking number', r.phone === '(689) 366-6860', r.phone)
  check('and the callback is the shop’s own line', r.callbackPhone === REAL, r.callbackPhone)
  // THE WHOLE POINT: on the confirmation card these two are different, and
  // each has to be the right one for its direction.
  check('the two differ, which is the case that was broken', r.phone !== r.callbackPhone)
  check('the call link rings the tracked number', telHref(r.phone) === 'tel:+16893666860', telHref(r.phone) || '')
  // THE REVERSAL. A text to the tracked number now reaches the app, so that
  // is where the site points one — the photo arrives on the lead with the
  // attribution of the number that earned it.
  check(
    'the text link goes to the TRACKED number, because texts land in the app now',
    (smsHref(r.phone, 'hi') || '').startsWith('sms:+16893666860'),
    smsHref(r.phone, 'hi') || 'null'
  )
}

console.log('\n--- a shop running somebody else’s call tracking ---')
{
  // HighLevel or a vendor pool: the DISPLAY number is theirs, but the callback
  // still comes from the shop's own handset.
  const r = resolve({ phone: REAL, siteDisplayPhone: EXTERNAL })
  check('the site shows the external pool number', r.phone === '(949) 555-1234', r.phone)
  check('the callback is still the shop’s line', r.callbackPhone === REAL, r.callbackPhone)
}

console.log('\n--- a shop with no tracking at all ---')
{
  const r = resolve({ phone: REAL })
  check('both are the shop’s line', r.phone === REAL && r.callbackPhone === REAL)
  // The copy then reads exactly as it always did, which is what makes this
  // change safe for the twelve shops that have no tracking number.
  check('so the confirmation names one number, as before', r.phone === r.callbackPhone)
}

console.log('\n--- a raw number, as the intake actually stores it ---')
{
  const r = resolve({ phone: '3215995777', trackingNumber: TRACKING })
  check('the callback is formatted for reading', r.callbackPhone === '(321) 599-5777', r.callbackPhone)
  check('and still dials correctly', telHref(r.callbackPhone) === 'tel:+13215995777', telHref(r.callbackPhone) || '')
}

console.log('\n--- the text destination, after the reversal ---')
{
  const r = resolve({ phone: REAL, trackingNumber: TRACKING })
  const text = smsHref(r.phone, 'photo')
  check('the sms: target is the tracked number', !!text && text.includes('+16893666860'), text || 'null')
  // The body still has to survive the separator rule — iOS reads the &,
  // Android the ?, so contact-links.ts writes "?&".
  check('and carries the pre-written body', !!text && text.includes('?&body='), text || '')

  // With no tracking number there is nothing to reverse: the shop's own line
  // is both the display number and the callback, and a text goes there.
  const plain = resolve({ phone: REAL })
  check(
    'a shop with no tracking number is texted on its own line',
    (smsHref(plain.phone, 'photo') || '').includes('+17145821740')
  )
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
