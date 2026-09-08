/**
 * Can we still verify a Twilio signature?
 *
 *   npx tsx scripts/check-twilio-signature.ts
 *
 * WHY THIS EXISTS. `verifyTwilioSignature` read `validateRequest` off the ESM
 * namespace object of a CommonJS package, where it is undefined. So every call
 * to a tracking number threw, the voice webhook answered 500 with no TwiML,
 * and Twilio played an error message to a real customer instead of ringing the
 * shop. Seventeen calls over two weeks. Nothing surfaced it: no lead was
 * written, so there was no wrong row to notice — only an absence, which looks
 * exactly like a quiet fortnight.
 *
 * The dangerous property of this function is that BOTH failure modes are
 * silent from the outside. Broken so it throws drops every call; broken so it
 * always returns false drops every call too, and 403s look like an attack
 * rather than a bug. So this signs a request the way Twilio actually signs one
 * — HMAC-SHA1 over the URL plus the POST parameters sorted by key, base64 —
 * and asserts we accept that and reject anything else.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real function and exits non-zero when it is wrong.
 */
import { createHmac } from 'node:crypto'
import { verifyTwilioSignature, publicUrl } from '@/lib/twilio-voice'
import { prisma } from '@/lib/db'

const TOKEN = 'test_auth_token_0123456789abcdef'
const URL_UNDER_TEST = 'https://glassleads.app/api/webhooks/twilio/voice'

/** Twilio's own algorithm, written out so the test does not use their code. */
function sign(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

const PARAMS: Record<string, string> = {
  AccountSid: 'AC00000000000000000000000000000000',
  CallSid: 'CA11111111111111111111111111111111',
  From: '+15625551234',
  To: '+17145551740',
  CallStatus: 'ringing',
  Direction: 'inbound',
}

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

function requestWith(signature: string): Request {
  return new Request(URL_UNDER_TEST, {
    method: 'POST',
    headers: {
      'x-twilio-signature': signature,
      'x-forwarded-host': 'glassleads.app',
      'x-forwarded-proto': 'https',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(PARAMS).toString(),
  })
}

async function main() {
  // The auth token comes from the Setting table or the environment. Set it
  // here so the check needs no credentials and touches no real account.
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  process.env.TWILIO_ACCOUNT_SID = PARAMS.AccountSid

  const good = sign(TOKEN, URL_UNDER_TEST, PARAMS)

  console.log('--- a correctly signed request is accepted ---')
  /* THE CASE THAT WAS BROKEN. It is not enough that this does not throw: a
     version that always returned false would also stop every call, and would
     read in the logs as somebody attacking the endpoint. */
  const accepted = await verifyTwilioSignature(requestWith(good), URL_UNDER_TEST, PARAMS)
  check(`accepted: ${JSON.stringify(accepted)}`, accepted.ok, accepted.reason)

  console.log('\n--- and everything else is refused, with a reason ---')
  const wrongSig = await verifyTwilioSignature(
    requestWith(sign('a-different-token', URL_UNDER_TEST, PARAMS)),
    URL_UNDER_TEST,
    PARAMS
  )
  check('a signature from another token', !wrongSig.ok, JSON.stringify(wrongSig))

  // Twilio signs the URL as well as the body, so a request replayed at another
  // address must not verify.
  const wrongUrl = await verifyTwilioSignature(
    requestWith(good),
    'https://glassleads.app/api/webhooks/twilio/status',
    PARAMS
  )
  check('the same signature at another URL', !wrongUrl.ok, JSON.stringify(wrongUrl))

  const tampered = await verifyTwilioSignature(requestWith(good), URL_UNDER_TEST, {
    ...PARAMS,
    From: '+19995550000',
  })
  check('a tampered parameter', !tampered.ok, JSON.stringify(tampered))

  const unsigned = new Request(URL_UNDER_TEST, { method: 'POST', body: '' })
  const noHeader = await verifyTwilioSignature(unsigned, URL_UNDER_TEST, PARAMS)
  check('no signature header at all', !noHeader.ok, JSON.stringify(noHeader))

  console.log('\n--- it REPORTS rather than throws ---')
  // The route answers TwiML on every path it can; a throw here is what turned
  // a ringing phone into Twilio's error message.
  let threw = false
  try {
    await verifyTwilioSignature(requestWith('not-base64-at-all'), URL_UNDER_TEST, PARAMS)
  } catch {
    threw = true
  }
  check('garbage in the header does not throw', !threw)

  console.log('\n--- publicUrl rebuilds what Twilio signed ---')
  // Signature validation is over the PUBLIC url, so a wrong rebuild here fails
  // every real request while looking like a bad signature.
  check(
    `publicUrl -> ${publicUrl(requestWith(good))}`,
    publicUrl(requestWith(good)) === URL_UNDER_TEST
  )

  console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
  await prisma.$disconnect().catch(() => {})
  process.exit(bad === 0 ? 0 : 1)
}

main()
