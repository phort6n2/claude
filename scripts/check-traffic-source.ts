/**
 * Where a visitor came from, which number they see, and what Meta is sent.
 *
 * Run: npx tsx scripts/check-traffic-source.ts
 *
 * The silent cases first, because every failure here is silent: a Google
 * visitor shown a different number breaks Google's own call tracking with no
 * error anywhere; a returning visitor re-labelled "direct" loses the ad that
 * found them; an organic Bing visitor shown the Microsoft number credits the
 * campaign with a call it did not buy; and a phone number hashed without its
 * country code matches nobody at Meta and fails without a word.
 */

import {
  decodeTouch,
  encodeTouch,
  leadTrafficSource,
  mergeTouch,
  numberSourceAfterOptOut,
  numberSourceFor,
  numberSourceFromHeader,
  sourceFromReferrer,
  touchFromLanding,
  trafficSourceForNumber,
  trafficSourceLabel,
  type Touch,
} from '../src/lib/traffic-source'
import { buildMetaEvent, normalizeEmail, normalizePhone, normalizeZip, sha256 } from '../src/lib/meta-capi'
import { isValidTestToken, mintTestToken } from '../src/lib/lead-test-mode'
import { isMetaVariant } from '../src/lib/meta-variant'
import { GET } from '../src/app/widget.js/route'

let failures = 0
const check = (ok: boolean, msg: string) => {
  if (ok) console.log(`  ✓ ${msg}`)
  else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

const SITE = 'https://autoglassking.com'
const NOW = Date.UTC(2026, 9, 18, 18, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const land = (path: string, referrer: string | null = null, now = NOW) => ({ url: `${SITE}${path}`, referrer, now })

async function main() {
  console.log('\nGOOGLE VISITORS NEVER GET A DIFFERENT NUMBER (its own call swap watches the default)')
  for (const path of ['/?gclid=abc', '/?gbraid=abc', '/?wbraid=abc', '/?utm_source=google&utm_medium=cpc']) {
    const t = mergeTouch(null, land(path)).touch
    check(t.source === 'google' && numberSourceFor(t) === null, `${path} → google, default number`)
  }

  console.log('\nTHE ORDER IS THE EVIDENCE ORDER: click id, then utm_source, then referrer, then direct')
  check(touchFromLanding(land('/?gclid=a&msclkid=b'))?.source === 'google', 'gclid beats msclkid')
  check(touchFromLanding(land('/?msclkid=b&fbclid=c'))?.source === 'microsoft', 'msclkid beats fbclid')
  check(touchFromLanding(land('/?fbclid=c&utm_source=google'))?.source === 'meta', 'a click id beats utm_source')
  check(touchFromLanding(land('/?utm_source=bing&utm_medium=cpc', 'https://www.google.com/'))?.source === 'microsoft', 'utm_source beats the referrer')
  check(touchFromLanding(land('/', 'https://www.bing.com/search?q=x'))?.source === 'microsoft', 'bing.com referrer → microsoft')
  check(touchFromLanding(land('/', null)) === null, 'nothing on the request says nothing')
  check(mergeTouch(null, land('/')).touch.source === 'direct', '…and with nothing remembered it is direct')

  console.log('\nGOOGLE ADS\' OWN gad_* PARAMETERS ARE A GOOGLE AD WHEN THE gclid WAS STRIPPED')
  // Silent cases first: nothing else may start reading as a Google ad.
  check(touchFromLanding(land('/?gc_id=22874534569&g_special_campaign=true'))?.source !== 'google', 'undocumented gc_id / g_special_campaign alone are not evidence')
  check(touchFromLanding(land('/?gad_source=')) === null, 'an empty gad_source is not evidence')
  check(touchFromLanding(land('/', 'https://www.google.com/'))?.medium === 'organic', 'a bare google.com referrer is still organic')
  // Nima's real landing page, 2026-10-18 (GPC browser, no gclid):
  const nima = touchFromLanding(land('/auto-glass-repair?gc_id=22874534569&g_special_campaign=true&gad_source=1&gad_campaignid=23355809702'))
  check(nima?.source === 'google' && nima?.medium === 'paid', 'gad_source + gad_campaignid → Google Ads (paid)')
  check(nima?.campaign === '23355809702', '…carrying the campaign id')
  check(nima ? numberSourceFor({ source: nima.source, evidence: nima.evidence }) === null : false, '…and still the default number (Google is never a choice)')
  check(touchFromLanding(land('/?gad_source=1', 'https://www.google.com/'))?.medium === 'paid', 'stripped gclid + google.com referrer → paid, not organic')
  check(touchFromLanding(land('/?gad_source=1&msclkid=b'))?.source === 'microsoft', 'a real click id still beats gad_*')
  check(touchFromLanding(land('/?gad_source=1&utm_source=bing'))?.source === 'google', 'gad_* (written by Google) beats a typed utm_source')
  const metaThenGoogle = mergeTouch(mergeTouch(null, land('/?fbclid=x&utm_medium=paid')).touch, land('/?gad_source=1', null, NOW + DAY))
  check(metaThenGoogle.touch.source === 'google' && metaThenGoogle.changed, 'a later gad_* ad click replaces an earlier paid touch')
  // The lead, when the cookie predates the rule (Nima's said "direct"):
  check(JSON.stringify(leadTrafficSource({ trafficSource: 'direct', trafficMedium: 'none', landingPage: `${SITE}/?gad_source=1&gad_campaignid=1` })) === JSON.stringify({ source: 'google', medium: 'paid' }), 'a lead whose landing page has gad_* is Google Ads over a "direct" cookie')
  check(leadTrafficSource({ trafficSource: 'meta', trafficMedium: 'paid', landingPage: `${SITE}/?gad_source=1` }).source === 'meta', '…but never over a PAID verdict from another platform')
  check(leadTrafficSource({ trafficSource: 'direct', trafficMedium: 'none', landingPage: `${SITE}/?gc_id=1` }).source === 'direct', 'gc_id alone leaves a lead direct')

  console.log('\nAN ORGANIC VISIT NEVER SELECTS A PLATFORM NUMBER')
  const organicBing = mergeTouch(null, land('/', 'https://www.bing.com/')).touch
  check(organicBing.source === 'microsoft' && organicBing.medium === 'organic', 'organic Bing is recorded as Microsoft (organic)')
  check(numberSourceFor(organicBing) === null, '…but sees the default number')
  const fbShare = mergeTouch(null, land('/', 'https://l.facebook.com/')).touch
  check(fbShare.medium === 'social' && numberSourceFor(fbShare) === null, 'a Facebook referrer with no fbclid sees the default number')

  console.log('\nMICROSOFT AND META AD CLICKS SEE THEIR OWN NUMBER')
  check(numberSourceFor(mergeTouch(null, land('/?msclkid=test')).touch) === 'microsoft', '?msclkid → microsoft number')
  check(numberSourceFor(mergeTouch(null, land('/?fbclid=test&v=meta')).touch) === 'meta', '?fbclid → meta number')
  check(numberSourceFor(mergeTouch(null, land('/?utm_source=facebook&utm_medium=paid')).touch) === 'meta', 'utm_source=facebook → meta number')
  check(numberSourceFor(mergeTouch(null, land('/?utm_source=instagram')).touch) === 'meta', 'utm_source=instagram → meta number')
  check(numberSourceFor(mergeTouch(null, land('/?v=meta')).touch) === 'meta', '?v=meta alone → meta number (fbclid stripped by iOS, or no URL parameters)')
  check(numberSourceFor(mergeTouch(null, land('/windshield-replacement?v=meta')).touch) === 'meta', 'a service page with ?v=meta → meta number')
  check(mergeTouch(null, land('/?v=meta&gclid=x')).touch.source === 'google', 'a gclid still beats ?v=meta')
  const metaAd = touchFromLanding(land('/?fbclid=x&utm_medium=paid'))
  const metaShare = touchFromLanding(land('/?fbclid=x'))
  check(metaAd?.medium === 'paid' && metaShare?.medium === 'social', 'fbclid is paid only when the campaign says so')

  console.log('\nA PAID TOUCH SURVIVES A LATER DIRECT OR ORGANIC VISIT, FOR 90 DAYS')
  const meta = mergeTouch(null, land('/?fbclid=one')).touch
  const back = mergeTouch(meta, land('/', null, NOW + 3 * DAY))
  check(back.touch.source === 'meta' && !back.changed, 'typed back in three days later: still Meta, no new cookie')
  const viaGoogle = mergeTouch(meta, land('/', 'https://www.google.com/', NOW + 4 * DAY))
  check(viaGoogle.touch.source === 'meta', 'back through organic Google: still Meta')
  const internal = mergeTouch(meta, land('/windshield-replacement', `${SITE}/`, NOW + DAY))
  check(internal.touch.source === 'meta' && !internal.changed, 'clicking around the site changes nothing')
  const newAd = mergeTouch(meta, land('/?gclid=two', null, NOW + 5 * DAY))
  check(newAd.touch.source === 'google' && newAd.touch.firstSeenAt === meta.firstSeenAt, 'a new ad click wins, first-seen stays')
  const expired = mergeTouch(meta, land('/', null, NOW + 91 * DAY))
  check(expired.touch.source === 'direct' && expired.touch.firstSeenAt === meta.firstSeenAt, 'after 90 days it lapses to direct')
  const ref = mergeTouch(null, land('/', 'https://example.com/')).touch
  check(ref.source === 'other' && ref.medium === 'referral', 'another site → other (referral)')
  check(mergeTouch(ref, land('/?msclkid=z')).touch.source === 'microsoft', 'a referral is replaced by an ad click')

  console.log('\nOWN-SITE REFERRERS ARE NOT REFERRALS')
  check(sourceFromReferrer(`${SITE}/x`, 'autoglassking.com') === null, 'same host')
  check(sourceFromReferrer('https://www.autoglassking.com/x', 'autoglassking.com') === null, 'www vs apex')
  check(sourceFromReferrer('https://googleglass.com/', 'autoglassking.com')?.source === 'other', '"googleglass.com" is not Google')
  check(sourceFromReferrer('https://www.google.ca/', 'autoglassking.com')?.source === 'google', 'google.ca is Google')

  console.log('\nTHE COOKIE ROUND-TRIPS AND REFUSES RUBBISH')
  const t: Touch = mergeTouch(null, land('/?msclkid=abc&utm_campaign=Brand%20%E2%80%94%20OC')).touch
  const back2 = decodeTouch(encodeTouch(t))
  check(!!back2 && back2.source === 'microsoft' && back2.clickIds.msclkid === 'abc', 'source and click id survive')
  check(back2?.campaign === 'Brand — OC', 'a non-ASCII campaign survives')
  check(decodeTouch('garbage') === null && decodeTouch('') === null, 'garbage reads as no cookie')
  check(decodeTouch(encodeTouch({ ...t, clickIds: { msclkid: 'x'.repeat(400) } }))?.clickIds.msclkid === undefined, 'an oversized value is dropped')
  check(encodeTouch(t).length < 1200, `the cookie stays small (${encodeTouch(t).length} chars)`)

  console.log('\nTHE PAGE HEADER CANNOT PICK GOOGLE OR ANYTHING ELSE')
  check(numberSourceFromHeader('meta') === 'meta' && numberSourceFromHeader('microsoft') === 'microsoft', 'meta / microsoft accepted')
  check(numberSourceFromHeader('google') === null && numberSourceFromHeader('x') === null, 'google / anything else refused')

  console.log('\nA LEAD IS LABELLED FROM ITS EVIDENCE')
  check(leadTrafficSource({ msclkid: 'a', trafficSource: 'meta' }).source === 'microsoft', 'a click id beats the claimed source')
  check(leadTrafficSource({ trafficSource: 'meta', trafficMedium: 'paid' }).source === 'meta', 'the cookie verdict is used without a click id')
  check(leadTrafficSource({ utmSource: 'bing', utmMedium: 'cpc' }).medium === 'paid', 'utm only')
  check(leadTrafficSource({}).source === 'direct', 'nothing → direct')
  check(trafficSourceForNumber({ showTo: 'meta' }) === 'meta' && trafficSourceForNumber({ showTo: null }) === 'unknown', 'a call is labelled by the number dialled')
  check(trafficSourceLabel('meta', 'paid') === 'Meta Ads' && trafficSourceLabel('unknown') === 'Unknown', 'labels')

  console.log('\nMETA GETS HASHES IN EXACTLY ITS FORMAT')
  check(normalizePhone('(714) 555-0100') === '17145550100', 'a ten-digit number gains its country code')
  check(normalizePhone('+1 714 555 0100') === '17145550100', 'E.164 loses the +')
  check(normalizePhone('555') === null, 'a fragment is not a phone')
  check(normalizeEmail('  John@Example.COM ') === 'john@example.com', 'email trimmed and lower-cased')
  check(normalizeZip('92648-1234') === '92648' && normalizeZip('V6B 1A1') === 'v6b1a1', 'ZIP / postal code')
  const ev = buildMetaEvent({
    clientId: 'c',
    leadId: 'lead1',
    eventId: 'evt-1',
    eventTime: new Date(NOW),
    eventSourceUrl: `${SITE}/?v=meta`,
    email: 'John@Example.com',
    phone: '7145550100',
    firstName: 'John',
    fbc: 'fb.1.1.abc',
    fbp: 'fb.1.2.def',
    clientIp: '203.0.113.9',
    userAgent: 'UA',
  })
  const ud = ev.user_data as Record<string, unknown>
  check(ev.event_id === 'evt-1' && ev.event_name === 'Lead' && ev.action_source === 'website', 'event id, name and action_source')
  check((ud.em as string[])[0] === sha256('john@example.com'), 'em is the hash of the normalised email')
  check((ud.ph as string[])[0] === sha256('17145550100'), 'ph is the hash with the country code')
  check(ud.fbc === 'fb.1.1.abc' && ud.client_ip_address === '203.0.113.9', 'fbc, fbp, IP and UA are not hashed')
  check(!JSON.stringify(ev).includes('john@example.com') && !JSON.stringify(ev).includes('7145550100'), 'no plaintext email or phone anywhere')

  console.log('\nA DRY-RUN TOKEN WORKS FOR ONE CLIENT, FOR A WHILE')
  process.env.LEAD_LINK_SECRET = process.env.LEAD_LINK_SECRET || 'check-script-secret'
  const tok = mintTestToken('client-a', 60_000, NOW) as string
  check(isValidTestToken(tok, 'client-a', NOW + 1000), 'valid for its client')
  check(!isValidTestToken(tok, 'client-b', NOW + 1000), 'refused for another client')
  check(!isValidTestToken(tok, 'client-a', NOW + 120_000), 'refused once expired')
  check(!isValidTestToken(tok.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), 'client-a', NOW), 'refused when tampered')

  console.log('\nAN OPTED-OUT VISITOR NEVER SEES THE META NUMBER (its calls are reported to Meta)')
  check(numberSourceAfterOptOut('meta', true) === null, 'opted out + Meta ad → default number')
  check(numberSourceAfterOptOut('microsoft', true) === 'microsoft', 'opted out + Microsoft ad → still the Microsoft number (sent nowhere)')
  check(numberSourceAfterOptOut('meta', false) === 'meta', 'not opted out → the Meta number')
  check(numberSourceAfterOptOut(null, true) === null, 'no platform → default number')

  console.log('\nA CALL TO THE META NUMBER IS A phone_call LEAD, MATCHED BY THE CALLER ALONE')
  const callEvent = buildMetaEvent({
    clientId: 'c',
    leadId: 'lead-1',
    eventId: 'phone-CA123',
    eventName: 'Lead',
    actionSource: 'phone_call',
    eventTime: new Date(NOW),
    eventSourceUrl: null,
    phone: '+17145550100',
  })
  const callUd = callEvent.user_data as Record<string, unknown>
  check(callEvent.action_source === 'phone_call', 'action_source is phone_call')
  check(callEvent.event_name === 'Lead' && callEvent.event_id === 'phone-CA123', 'a Lead, keyed on the Sid')
  check(JSON.stringify(callUd.ph) === JSON.stringify([sha256('17145550100')]), 'caller number hashed with its country code')
  check(!('event_source_url' in callEvent) && !callUd.client_user_agent && !callUd.fbc, 'no page, browser or cookie data invented for a call')
  check(buildMetaEvent({ clientId: 'c', leadId: null, eventId: 'x', eventTime: new Date(NOW), eventSourceUrl: null }).action_source === 'website', 'a form lead is still action_source website')

  console.log('\nTHE META VARIANT IS ?v=meta AND NOTHING ELSE')
  check(isMetaVariant({ v: 'meta' }) && isMetaVariant({ v: 'META' }), '?v=meta')
  check(!isMetaVariant({}) && !isMetaVariant({ v: 'google' }) && !isMetaVariant(undefined), 'anything else')

  console.log('\nTHE SERVED WIDGET CARRIES THE NEW FIELDS (the real script, not a copy)')
  const js = await (await GET()).text()
  for (const needle of ['gl_src', 'meta_event_id', 'privacy_opt_out', '_test_token', 'traffic_source', 'event_id: payload.meta_event_id', 'test: !!TEST_TOKEN']) {
    check(js.includes(needle), `widget.js mentions ${needle}`)
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function(js)
    check(true, 'the served script parses')
  } catch (e) {
    check(false, `the served script parses: ${e instanceof Error ? e.message : e}`)
  }

  console.log(failures ? `\n${failures} FAILED` : '\nAll traffic-source checks passed')
  process.exit(failures ? 1 : 0)
}

main()
