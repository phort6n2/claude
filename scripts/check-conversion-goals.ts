/**
 * Which conversion actions are actually driving Smart Bidding.
 *
 * Run: npx tsx scripts/check-conversion-goals.ts
 *
 * TWO SWITCHES, AND READING ONE OF THEM MADE A FALSE CLAIM. Biddability is set
 * per CATEGORY~ORIGIN goal, which is why the audit reads
 * `customer_conversion_goal` at all — but a conversion ACTION carries its own
 * `primary_for_goal`, and Google is explicit that false there takes the action
 * out of bidding "regardless of their customer conversion goal or campaign
 * conversion goal".
 *
 * So an account can have PURCHASE~WEBSITE biddable AND AGMP Sale excluded, and
 * that is exactly what the Ads UI produces when somebody sets that one action
 * to Secondary. The audit reported the GOAL and NAMED THE ACTION — "AGMP Sale
 * … should be Secondary" about an action that already was. An operator who had
 * done the right thing was told to do it again, which is the queue lying, and
 * the way a queue stops being believed.
 *
 * The fixtures are two real accounts, verbatim from the API, because the shape
 * is the whole point: `biddable` is OMITTED when false and `primary_for_goal`
 * is OMITTED when TRUE. Two protobuf defaults pointing opposite ways, in the
 * same audit.
 */

import { compareToStandard } from '../src/lib/google-ads-conventions'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const action = (
  name: string,
  category: string,
  origin: string,
  extra: Record<string, unknown> = {}
) => ({
  conversionAction: {
    id: `${name.length}00`,
    name,
    status: 'ENABLED',
    type: category === 'PURCHASE' ? 'UPLOAD_CLICKS' : 'WEBPAGE',
    category,
    origin,
    countingType: 'ONE_PER_CLICK',
    clickThroughLookbackWindowDays: '90',
    ...extra,
  },
})

const goal = (category: string, origin: string, biddable?: true) => ({
  customerConversionGoal: {
    category,
    origin,
    // Present ONLY when true — the API omits it otherwise, and the audit has
    // to read the absence as Secondary rather than as unknown.
    ...(biddable ? { biddable: true } : {}),
  },
})

const SALE = 'AGMP Sale'
const saleIssues = (actions: ReturnType<typeof action>[], goals: ReturnType<typeof goal>[]) =>
  compareToStandard('123', actions, goals).goalIssues.filter((i) => i.startsWith(SALE))

console.log('\nMAG-JEN, verbatim: the goal is Primary and the ACTION is Secondary')
{
  /* The case that produced the false claim. `primary_for_goal: false` is the
     operator having already done the right thing. */
  const issues = saleIssues(
    [action(SALE, 'PURCHASE', 'WEBSITE', { primaryForGoal: false })],
    [goal('PURCHASE', 'WEBSITE', true)]
  )
  if (issues.length === 0) pass('silent — the action is out of bidding, whatever the goal says')
  else fail(`told the operator to undo a correct setting: ${issues[0]}`)
}

console.log('\nBoth Primary: it really is driving bidding')
{
  const issues = saleIssues(
    [action(SALE, 'PURCHASE', 'WEBSITE', { primaryForGoal: true })],
    [goal('PURCHASE', 'WEBSITE', true)]
  )
  if (issues.length === 1 && /driving bidding/.test(issues[0])) pass(issues[0].slice(0, 76) + '…')
  else fail(`expected one finding about it driving bidding, got ${JSON.stringify(issues)}`)
  // And it must say which switch to throw. Flipping the GOAL would take every
  // other action in PURCHASE~WEBSITE out of bidding with it.
  if (/Set the ACTION to Secondary/.test(issues[0] || '')) pass('names the ACTION, not the goal')
  else fail('does not say which of the two switches to change')
}

console.log('\nOmitted primary_for_goal means TRUE — the opposite default to biddable')
{
  // The trap in reading this API: one field is dropped when false, the other
  // when true, and a single "missing means off" rule gets one of them wrong.
  const issues = saleIssues(
    [action(SALE, 'PURCHASE', 'WEBSITE')],
    [goal('PURCHASE', 'WEBSITE', true)]
  )
  if (issues.length === 1) pass('an omitted flag is read as Primary, so this still fires')
  else fail('omitted primary_for_goal was read as false — the wrong default')
}

console.log('\nAuto Glass Kings, verbatim: the goal itself is Secondary')
{
  // `biddable` absent. Nothing to report whichever way the action is set.
  for (const primaryForGoal of [true, false]) {
    const issues = saleIssues(
      [action(SALE, 'PURCHASE', 'WEBSITE', { primaryForGoal })],
      [goal('PURCHASE', 'WEBSITE')]
    )
    if (issues.length === 0) pass(`silent with the goal Secondary (action primary=${primaryForGoal})`)
    else fail(`fired on a Secondary goal: ${issues[0]}`)
  }
}

console.log('\nThe three that SHOULD bid')
{
  const FORM = 'AGMP Lead Form'
  const only = (issues: string[]) => issues.filter((i) => i.startsWith(FORM))

  // Goal Primary, action Primary: correct, silent.
  const fine = only(
    compareToStandard(
      '123',
      [action(FORM, 'SUBMIT_LEAD_FORM', 'WEBSITE', { primaryForGoal: true })],
      [goal('SUBMIT_LEAD_FORM', 'WEBSITE', true)]
    ).goalIssues
  )
  if (fine.length === 0) pass('a correctly biddable action is silent')
  else fail(`fired on a correct setup: ${fine[0]}`)

  // Goal Primary, ACTION Secondary — bidding ignores it, and the fix is on
  // the action. This was previously invisible: the goal looked right.
  const actionOff = only(
    compareToStandard(
      '123',
      [action(FORM, 'SUBMIT_LEAD_FORM', 'WEBSITE', { primaryForGoal: false })],
      [goal('SUBMIT_LEAD_FORM', 'WEBSITE', true)]
    ).goalIssues
  )
  if (actionOff.length === 1 && /action itself is set to Secondary/.test(actionOff[0]))
    pass('an action switched off under a Primary goal is caught')
  else fail(`missed an action excluded from bidding: ${JSON.stringify(actionOff)}`)

  // GOAL Secondary, action Primary — the other half, and a different screen.
  const goalOff = only(
    compareToStandard(
      '123',
      [action(FORM, 'SUBMIT_LEAD_FORM', 'WEBSITE', { primaryForGoal: true })],
      [goal('SUBMIT_LEAD_FORM', 'WEBSITE')]
    ).goalIssues
  )
  if (goalOff.length === 1 && /its goal .* is Secondary/.test(goalOff[0]))
    pass('a Secondary goal under a Primary action is caught')
  else fail(`missed a non-biddable goal: ${JSON.stringify(goalOff)}`)
}

console.log('\nNo action, nothing to say about its goal')
{
  // The missing action is already reported by the findings list. Repeating it
  // here as a bidding problem is two rows for one fix.
  const issues = saleIssues([], [goal('PURCHASE', 'WEBSITE', true)])
  if (issues.length === 0) pass('a goal with no matching action files nothing')
  else fail(`spoke about an action that does not exist: ${issues[0]}`)
}

console.log(
  failures === 0
    ? '\nAll conversion-goal checks passed.'
    : `\n${failures} conversion-goal check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
