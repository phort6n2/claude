/**
 * What does the tag check say about enhanced conversions?
 *
 *   npx tsx scripts/check-enhanced-conversions.ts
 *
 * WHY THIS IS WORTH A SCRIPT. Every failure mode here is a SENTENCE, not a
 * crash, and the sentences are the entire product: this check exists so an
 * operator looking at Google's own enhanced-conversions dialog can find out
 * what is actually set up. Two ways to get that wrong, both silent:
 *
 * - A GREEN TICK THAT COVERS LESS THAN IT APPEARS. The API exposes no
 *   enhanced-conversions field on a conversion action and no way to see
 *   whether the customer-data terms were accepted, so nothing here can
 *   confirm Google's side. If the panel went all-green while that was
 *   unknown, the check would be actively misleading — worse than absent.
 * - A RED CROSS FOR A DELIBERATE SETTING. Our own toggle being off is a
 *   choice, not a fault; marking it as a failure is how operators learn to
 *   ignore red crosses.
 *
 * So the assertions below are mostly about which checks carry `info` and what
 * the text says, which is unusual for a test and exactly right for this one.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import {
  enhancedConversionChecks,
  type EnhancedInput,
} from '@/lib/ads-enhanced-conversions'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/** A page with both halves of the tag on it, as the live sites serve. */
const GOOD_HTML = `
  <script src="https://www.googletagmanager.com/gtag/js?id=AW-123"></script>
  <script>gtag('config', "AW-123", { allow_enhanced_conversions: true });
  function report(sendTo, txn, userData) {
    if (ENHANCED && userData) { window.gtag('set', 'user_data', userData); }
  }
  if (detail.phone) userData.phone_number = detail.phone;
  </script>`

const base: EnhancedInput = {
  conversionId: 'AW-123',
  leadSendTo: 'AW-123/abcDEF',
  enabledInApp: true,
  html: GOOD_HTML,
  leadsFlagInGoogle: null,
}
const run = (over: Partial<EnhancedInput> = {}) => enhancedConversionChecks({ ...base, ...over })
const find = (cs: ReturnType<typeof run>, needle: string) =>
  cs.find((c) => c.label.toLowerCase().includes(needle))

console.log('--- a site with it all wired up ---')
{
  const cs = run()
  const page = find(cs, 'on the page')
  const handover = find(cs, 'hands over')
  const google = find(cs, "google's own")
  check('the page check passes', page?.ok === true, JSON.stringify(page))
  check('the hand-off check passes', handover?.ok === true, JSON.stringify(handover))
  // THE POINT. Google's half is unknowable, and the panel has to say so even
  // when everything it CAN see is green.
  check("Google's own setting is still reported as unverifiable", !!google && google.info === true)
  check(
    'and it names where to look',
    !!google && /Goals → Conversions/.test(google.detail),
    google?.detail
  )
  check(
    'and says the in-page code is already done, so nobody adds it twice',
    !!google && /already on the site/.test(google.detail)
  )
}

console.log('\n--- our own toggle off ---')
{
  const cs = run({ enabledInApp: false })
  check('exactly one check, not a pile', cs.length === 1, JSON.stringify(cs.map((c) => c.label)))
  // A deliberate setting is INFO. A red cross here trains people to ignore
  // red crosses on the checks that are real.
  check('it is info, not a failure', cs[0].info === true && cs[0].ok === false)
  check(
    'and it says Google cannot rescue it',
    /nothing for it to receive/.test(cs[0].detail),
    cs[0].detail
  )
  check(
    'the page is not examined at all',
    !cs.some((c) => c.label.includes('page') && c.ok),
    'it would be reporting on a tag that deliberately omits this'
  )
}

console.log('\n--- deployed without it ---')
{
  const cs = run({ html: '<script src="https://www.googletagmanager.com/gtag/js?id=AW-123"></script>' })
  const page = find(cs, 'on the page')
  check('the page check fails', page?.ok === false)
  check('it is a real failure, not info', page?.info === undefined)
  // The commonest cause by far, and the one that resolves itself.
  check('it mentions the cache', /cached for up to 5 minutes/.test(page?.detail || ''), page?.detail)
}
{
  // The tag asks for enhanced conversions but never hands the data over: the
  // exact state that looks fine in Google's dialog and sends nothing.
  const html = GOOD_HTML.replace(/user_data/g, 'nothing_here')
  const cs = run({ html })
  const handover = find(cs, 'hands over')
  check('a page that asks but never sets user_data fails', handover?.ok === false)
  check(
    'and explains that automatic detection cannot stand in',
    /shadow root/.test(handover?.detail || ''),
    handover?.detail
  )
}

console.log('\n--- nothing to check against ---')
check('no conversion id produces no checks at all', run({ conversionId: null }).length === 0)
{
  const cs = run({ html: null })
  const page = find(cs, 'on the page')
  check('an unreachable page is info, not a failure', page?.info === true && page?.ok === false)
  check("Google's half is still reported", !!find(cs, "google's own"))
}
{
  const cs = run({ leadSendTo: null })
  check('no form conversion means no hand-off check', !find(cs, 'hands over'))
  check('the page check still runs', find(cs, 'on the page')?.ok === true)
}

console.log('\n--- the leads flag, which is a different setting with a similar name ---')
{
  const on = find(run({ leadsFlagInGoogle: true }), 'for leads')
  const off = find(run({ leadsFlagInGoogle: false }), 'for leads')
  check('reported when Google was asked', !!on && !!off)
  // Never a fault either way: this app's uploads carry a click id, so neither
  // state changes anything. Printed only so nobody reads it as the answer to
  // the per-action question above it.
  check('on is not a fault', on?.ok === true && on?.info === true)
  check('off is not a fault either', off?.ok === true && off?.info === true)
  check('both say it is the separate feature', /separate/.test(on?.detail || '') && /separate/.test(off?.detail || ''))
  check('and that our uploads use the click id', /click id/.test(off?.detail || ''), off?.detail)
  check('absent when Google was not asked', !find(run({ leadsFlagInGoogle: null }), 'for leads'))
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
