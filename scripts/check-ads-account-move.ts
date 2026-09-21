/**
 * Moving a shop to a different Google Ads account.
 *
 * Run: npx tsx scripts/check-ads-account-move.ts
 *
 * ONE ACCOUNT HAS TWO NAMES IN THIS APP and nothing made them agree: the
 * customer id picked from a dropdown, and the `AW-…` that arrives inside a
 * pasted conversion snippet. A shop whose Ads account is replaced — a
 * suspension, a billing mess, an agency handover — had the new customer id
 * saved while both conversion snippets stayed pointed at the OLD account.
 *
 * The failure is this codebase's favourite shape: nothing errors. The tag
 * loads, the page is fine, and the conversion audit, the landing-page check,
 * the offline upload and the monthly report's cost per conversion all
 * interrogate the NEW account and find a tidy, correct, empty setup. The only
 * thing that ever noticed was the one-account rule in the save route, refusing
 * a new lead snippet because the old call conversion was still saved beside
 * it — which reads as the app rejecting a correct snippet.
 *
 * Two halves are checked here:
 *   1. the MOVE clears the old conversions, and the three neighbouring cases
 *      that must NOT clear;
 *   2. the AUDIT proves a mismatch afterwards, against the account's own
 *      `conversion_tracking_setting.conversion_tracking_id`.
 */

import { compareToStandard } from '../src/lib/google-ads-conventions'
import { isAccountMove } from '../src/lib/ads-snippet'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

/* ------------------------------------------------------------------ *
 * 1. THE CLEAR, and the three cases that are not a move.
 *
 * THE REAL FUNCTION, imported — not a restatement of it. A check that
 * re-implements the rule it is checking passes for ever while the route
 * drifts away underneath it, which is the one failure a check script cannot
 * survive. `isAccountMove` lives in `ads-snippet.ts` (a leaf: it imports
 * nothing) precisely so this file can reach it without pulling in Next or
 * Prisma.
 * ------------------------------------------------------------------ */

const movedAccount = isAccountMove

console.log('\nChanging to a different account is a MOVE, and clears')
{
  if (movedAccount('1112223333', '4445556666')) pass('account A → account B clears the conversions')
  else fail('a genuine account change did not clear')
}

console.log('\nThe three neighbours that must NOT clear')
{
  /* FIRST SELECTION. Pasting the snippets and then picking the account is the
     normal setup order — clearing here wipes what was just saved, which is
     the incident the route already records in the other direction. */
  if (!movedAccount(null, '4445556666')) pass('nothing → an account keeps them (first selection)')
  else fail('picking an account for the first time wiped the snippets')
  if (!movedAccount('', '4445556666')) pass('empty string → an account keeps them')
  else fail('an empty stored account was read as a move')

  /* UNSELECTING. The account id exists to interrogate the account, not to tag
     the site: a client running their own Ads has no customer id here and
     perfectly valid snippets. */
  if (!movedAccount('1112223333', null)) pass('an account → nothing keeps them (unselecting)')
  else fail('unselecting the account wiped valid snippets')

  // Re-saving the same account — every visit to this card does it.
  if (!movedAccount('1112223333', '1112223333')) pass('the same account re-saved keeps them')
  else fail('an unchanged account was read as a move')
}

/* ------------------------------------------------------------------ *
 * 2. THE AUDIT proves it afterwards.
 * ------------------------------------------------------------------ */

const action = (name: string, category: string, origin: string) => ({
  conversionAction: {
    id: `${name.length}00`,
    name,
    status: 'ENABLED',
    type: 'WEBPAGE',
    category,
    origin,
    countingType: 'ONE_PER_CLICK',
    clickThroughLookbackWindowDays: '90',
  },
})
const goal = (category: string, origin: string) => ({
  customerConversionGoal: { category, origin, biddable: true },
})

/**
 * The `customer` row, in the shape a live account returns it.
 *
 * Verified against customer 6109211627, which answers
 * `conversion_tracking_id: "715255323"` — a STRING, the int64 rule this
 * codebase already records — for the account whose site carries
 * `AW-715255323`. `cross_account_conversion_tracking_id` and
 * `google_ads_conversion_customer` were OMITTED on that account, the same
 * protobuf-drops-defaults rule `biddable` and `primary_for_goal` need.
 */
const customerRow = (tracking: Record<string, unknown> | null) => [
  { customer: tracking ? { conversionTrackingSetting: tracking } : {} },
]

const tagIssues = (siteConversionId: string | null, tracking: Record<string, unknown> | null) =>
  compareToStandard(
    '123',
    [action('AGMP Lead Form', 'SUBMIT_LEAD_FORM', 'WEBSITE')],
    [goal('SUBMIT_LEAD_FORM', 'WEBSITE')],
    { siteConversionId, callSettingRows: customerRow(tracking) }
  ).accountSettings.filter((s) => /different account/i.test(s))

console.log('\nThe live shape: AGS, customer 6109211627')
{
  const ok = tagIssues('AW-715255323', { conversionTrackingId: '715255323' })
  if (ok.length === 0) pass('a site tagged with the account\'s own id is silent')
  else fail(`fired on a correctly tagged site: ${ok[0]}`)

  /* `AW-` on one side, bare digits on the other. Comparing the two forms
     directly is always false, which would report every correctly-tagged site
     in the book as tagged for the wrong account — the most expensive possible
     way to be wrong here. */
  const bare = tagIssues('715255323', { conversionTrackingId: '715255323' })
  if (bare.length === 0) pass('a stored id without the AW- prefix still matches')
  else fail('the AW- prefix alone produced a false mismatch')
}

console.log('\nThe reported case: the site still tagged for the old account')
{
  // The two ids from the refusal an operator actually hit.
  const issues = tagIssues('AW-311372501', { conversionTrackingId: '18465908527' })
  if (issues.length === 1) pass('a mismatch is reported')
  else fail(`expected one finding, got ${JSON.stringify(issues)}`)

  const line = issues[0] || ''
  // Both ids have to be in it. "The tag is wrong" without saying wrong
  // compared to WHAT is a finding nobody can act on.
  if (/AW-311372501/.test(line) && /AW-18465908527/.test(line)) {
    pass('names the tag on the site AND the account it should be')
  } else fail(`does not name both accounts: ${line}`)

  // The consequence is the whole point: the actions can all audit clean.
  if (/receive nothing|landing in/i.test(line)) pass('says the correct-looking actions get nothing')
  else fail('reports a mismatch without saying what it costs')
}

console.log('\nCROSS-ACCOUNT CONVERSION TRACKING IS NOT A FAULT')
{
  /* An account whose conversions are managed by its manager reports to the
     MANAGER's id, which arrives as `cross_account_conversion_tracking_id`.
     Firing on that is a confident finding about a correct setup — the exact
     thing that makes a queue go permanently red. */
  const managed = tagIssues('AW-999888777', {
    conversionTrackingId: '111222333',
    crossAccountConversionTrackingId: '999888777',
  })
  if (managed.length === 0) pass('a site tagged with the MANAGER\'s id is silent')
  else fail(`fired on legitimate cross-account tracking: ${managed[0]}`)

  // And a tag matching NEITHER is still a fault.
  const neither = tagIssues('AW-555', {
    conversionTrackingId: '111222333',
    crossAccountConversionTrackingId: '999888777',
  })
  if (neither.length === 1) pass('a tag matching neither id is still reported')
  else fail('a genuine mismatch was excused by the cross-account field')
}

console.log('\nSILENCE when there is nothing to compare')
{
  /* An absence is not evidence. An account with no conversion tracking id —
     one that has never had a conversion action — must not be told its tag is
     wrong, and a client with no snippets saved has no claim to check. */
  if (tagIssues('AW-311372501', null).length === 0) {
    pass('an account with no readable tracking id is not judged')
  } else fail('claimed a mismatch against an account that reported no id')

  if (tagIssues('AW-311372501', {}).length === 0) {
    pass('an empty tracking setting is not judged')
  } else fail('an empty setting was read as a mismatch')

  if (tagIssues(null, { conversionTrackingId: '715255323' }).length === 0) {
    pass('a site with no snippets saved is not judged')
  } else fail('spoke about a site that has no tag')

  // Rows the fetch never returned at all.
  if (
    compareToStandard('123', [action('AGMP Lead Form', 'SUBMIT_LEAD_FORM', 'WEBSITE')], null, {
      siteConversionId: 'AW-311372501',
    }).accountSettings.length === 0
  ) {
    pass('a failed customer fetch files nothing rather than guessing')
  } else fail('a missing customer row produced a finding')
}

console.log('\nsnake_case rows read the same account the same way')
{
  /* REST answers camelCase; rows captured from a protobuf client are
     snake_case. A reader that knows only one of them sees an account with no
     tracking id and stays SILENT about a real mismatch — failing open, which
     is the direction nobody notices. */
  const issues = tagIssues('AW-311372501', { conversion_tracking_id: '18465908527' })
  if (issues.length === 1) pass('a snake_case row still catches the mismatch')
  else fail('snake_case rows were read as an account with no tracking id')
}

console.log(
  failures === 0
    ? '\nAll ads account-move checks passed.'
    : `\n${failures} ads account-move check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
