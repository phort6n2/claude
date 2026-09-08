/**
 * What gets stored for the all-keywords map, out of what somebody pasted.
 *
 *   npx tsx scripts/check-rank-map-url.ts
 *
 * WHY THIS IS WORTH A SCRIPT. This parsing has now been wrong twice in ways
 * nothing surfaced. First it rejected the dashboard URL — the one form an
 * operator actually has in their hand — and stored the vendor's own host to be
 * embedded in a client's portal. Then it folded three different failures into
 * an empty string, so a correct paste of our own white-label address saved as
 * blank whenever LOCALDOMINATOR_SHARE_HOST was unset, and the card blamed the
 * paste for a missing token it plainly had. Both times the visible symptom was
 * "the map isn't showing", which points at the embed, the vendor, the client's
 * portal — anywhere but the field.
 *
 * The rule being protected: a client must never see the vendor's host. That is
 * NOT the same as "only the configured host is allowed", and reading it as the
 * second is what broke the first.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */
import { rankMapUrlFrom, rankMapTokenFrom, isVendorHost } from '@/lib/local-dominator'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const TOKEN = 'e35f1e27b3612329e653b64d008f373dd6578a87230edcb32f7826ed95745c2b'
const UUID = '1e164f2a-9c31-4f7e-b0d2-5d7c8a1b3e44'
const OURS = 'ranking.autoglassmarketingpros.com'
const WHITE_LABEL = `https://${OURS}/${TOKEN}`
const DASHBOARD = `https://app.localdominator.co/heatmap?taskId=9912&link=${TOKEN}`

const url = (r: ReturnType<typeof rankMapUrlFrom>) => ('url' in r ? r.url : `ERROR: ${r.error}`)

console.log('--- with a share host configured, everything lands on it ---')
for (const [name, input] of [
  ['bare token', TOKEN],
  ['our white-label URL', WHITE_LABEL],
  ['their dashboard URL', DASHBOARD],
  ['a uuid token', UUID],
] as const) {
  const out = rankMapUrlFrom(input, OURS)
  const want = `https://${OURS}/${input === UUID ? UUID : TOKEN}`
  check(`${name} -> ${url(out)}`, 'url' in out && out.url === want, `wanted ${want}`)
}

console.log('\n--- with NO share host configured ---')
/* THE CASE THAT BROKE. A paste of our own white-label address is already
   white-labelled; discarding it protected nobody and emptied the field. */
const noHostOurs = rankMapUrlFrom(WHITE_LABEL, null)
check(
  `our own URL is kept as-is -> ${url(noHostOurs)}`,
  'url' in noHostOurs && noHostOurs.url === WHITE_LABEL,
  'this is the paste that silently saved as empty'
)

// The rule that must not bend: their host never reaches a client's portal.
const noHostTheirs = rankMapUrlFrom(DASHBOARD, null)
check(
  'their dashboard URL is REFUSED, not stored',
  'error' in noHostTheirs && /LOCALDOMINATOR_SHARE_HOST/.test(noHostTheirs.error),
  url(noHostTheirs)
)
const noHostBare = rankMapUrlFrom(TOKEN, null)
check(
  'a bare token with nowhere to sit is refused',
  'error' in noHostBare && /LOCALDOMINATOR_SHARE_HOST/.test(noHostBare.error),
  url(noHostBare)
)

console.log('\n--- a configured host always WINS over a pasted one ---')
const rebuilt = rankMapUrlFrom(`https://someone-elses-host.example.com/${TOKEN}`, OURS)
check(
  `rebuilt on ours -> ${url(rebuilt)}`,
  'url' in rebuilt && rebuilt.url === `https://${OURS}/${TOKEN}`
)

console.log('\n--- junk is refused with a reason, never stored as blank ---')
for (const junk of ['hello', 'https://example.com/', 'https://example.com/not-a-token!!']) {
  const out = rankMapUrlFrom(junk, OURS)
  check(`${JSON.stringify(junk)} refused`, 'error' in out, url(out))
}
const cleared = rankMapUrlFrom('', OURS)
check('an empty value clears the field', 'url' in cleared && cleared.url === '')

console.log('\n--- vendor hosts, including subdomains ---')
for (const h of ['localdominator.co', 'app.localdominator.co', 'API.LocalDominator.co']) {
  check(`${h} is theirs`, isVendorHost(h))
}
for (const h of [OURS, 'localdominator.co.uk', 'notlocaldominator.co', '']) {
  check(`${h || '(empty)'} is not theirs`, !isVendorHost(h))
}

console.log('\n--- the token reader still takes all three forms ---')
check('bare', rankMapTokenFrom(TOKEN) === TOKEN)
check('white-label URL', rankMapTokenFrom(WHITE_LABEL) === TOKEN)
check('dashboard URL (taskId ignored)', rankMapTokenFrom(DASHBOARD) === TOKEN)

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
