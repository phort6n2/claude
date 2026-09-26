/**
 * The portal menu and the "Ring these back" list on Leads.
 *
 * Run: npx tsx scripts/check-portal-menu.ts
 *
 * Two rules that are each wrong in a way nothing would show:
 *
 * - The MENU: every report page must light up Reports and appear in its
 *   sub-tabs, and a conditional section (Calls, Rankings) must never leave a
 *   sub-tab pointing at a page this shop does not have. Three pages have been
 *   unfindable at some point; a fourth added to one list and not the other
 *   would be the same mistake.
 * - The CALL-BACK LIST: every way it can overstate is a shop told to ring
 *   somebody they already spoke to, and every way it can understate is a
 *   missed customer. The silent cases come first.
 */

import {
  MAIN_TABS,
  REPORT_SECTIONS,
  isActive,
  isReportPath,
  reportSectionsFor,
} from '../src/lib/portal-nav'
import { selectCallsToRingBack, type RingBackRow } from '../src/lib/call-patterns'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

console.log('\nThe bar is three tabs, the same for every shop')
{
  if (MAIN_TABS.map((t) => t.label).join() === 'Home,Leads,Reports') pass('Home · Leads · Reports')
  else fail(`bar is ${MAIN_TABS.map((t) => t.label).join(' · ')}`)
  // 360px / 3 columns = 120px; 12px semibold ≈ 7px a character.
  const longest = Math.max(...MAIN_TABS.map((t) => t.label.length))
  if (longest * 7 < 110) pass(`longest label ${longest} chars fits a 120px column`)
  else fail(`a tab label will not fit a 360px phone: ${longest} chars`)
}

console.log('\nEvery report page lights up Reports, and nothing else does')
{
  const reports = MAIN_TABS.find((t) => t.label === 'Reports')!
  for (const s of REPORT_SECTIONS) {
    for (const path of [s.href, `${s.href}/anything`]) {
      if (isActive(reports, path) && isReportPath(path)) pass(`${path} → Reports`)
      else fail(`${path} does not highlight Reports — the owner loses their place`)
    }
  }
  for (const path of ['/portal', '/portal/leads', '/portal/leads/abc', '/portal/login']) {
    if (!isActive(reports, path)) pass(`${path} is not Reports`)
    else fail(`${path} wrongly highlights Reports`)
  }
  const home = MAIN_TABS.find((t) => t.label === 'Home')!
  if (isActive(home, '/portal') && !isActive(home, '/portal/leads')) pass('Home is exact-match only')
  else fail('Home highlights on every portal page')
  // A prefix is not a match: /portal/resultsfoo is not /portal/results.
  if (!isReportPath('/portal/resultsX')) pass('a mere prefix is not a report path')
  else fail('prefix matching treats /portal/resultsX as a report')
}

console.log('\nSub-tabs follow what the shop has — never a tab to a missing page')
{
  const labels = (f: { hasCalls: boolean; hasRankings: boolean }) =>
    reportSectionsFor(f).map((s) => s.label).join(' · ')
  const none = labels({ hasCalls: false, hasRankings: false })
  const all = labels({ hasCalls: true, hasRankings: true })
  if (none === 'Summary · Traffic · Work done') pass(`nothing extra: ${none}`)
  else fail(`bare shop gets ${none}`)
  if (all === 'Summary · Calls · Traffic · Rankings · Work done') pass(`everything: ${all}`)
  else fail(`full shop gets ${all}`)
  // Never fewer than 3 — a group of one is not a group.
  if (reportSectionsFor({ hasCalls: false, hasRankings: false }).length >= 3) pass('never fewer than three sub-tabs')
  else fail('Reports can end up with one or two children')
  if (REPORT_SECTIONS[0].href === '/portal/results') pass('Summary first — Reports lands on it')
  else fail('the Reports tab does not land on the first sub-tab')
  // No report called "Activity" — it reads as lead activity.
  if (!REPORT_SECTIONS.some((s) => /activity/i.test(s.label))) pass('"Work done", not "Activity"')
  else fail('"Activity" is back as a label')
}

// ---- Ring these back -----------------------------------------------------

const NOW = Date.parse('2026-09-26T18:00:00Z')
let n = 0
const row = (over: Partial<RingBackRow> & { minsAgo: number }): RingBackRow => ({
  id: `r${++n}`,
  phone: '+15125550100',
  createdAt: new Date(NOW - over.minsAgo * 60_000),
  callStatus: 'no-answer',
  callDurationSecs: 20,
  status: 'NEW',
  firstTouchedAt: null,
  duplicateOfLeadId: null,
  duplicateOf: null,
  ...over,
})
// Newest first, as the query orders them.
const pick = (rows: RingBackRow[]) =>
  selectCallsToRingBack([...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))

console.log('\nSILENT: nothing to ring back')
{
  if (pick([]).length === 0) pass('no calls → empty list (and no card)')
  else fail('an empty week produced a call-back')
  if (pick([row({ minsAgo: 5, callStatus: 'completed' })]).length === 0) pass('an answered call is not a call-back')
  else fail('an answered call was listed')
  if (pick([row({ minsAgo: 5, callStatus: null })]).length === 0) {
    pass('a call still ringing (no status yet) is not listed')
  } else fail('a call with no outcome yet was called missed')
  if (pick([row({ minsAgo: 5, status: 'CONTACTED' })]).length === 0) pass('a contacted lead is handled')
  else fail('a handled lead stayed on the list')
  if (pick([row({ minsAgo: 5, firstTouchedAt: new Date() })]).length === 0) pass('a touched lead is handled')
  else fail('a touched lead stayed on the list')
}

console.log('\nTHE CANONICAL DECIDES, because a duplicate\'s own status is never updated')
{
  const repeat = row({
    minsAgo: 5,
    duplicateOfLeadId: 'canon1',
    duplicateOf: { status: 'CONTACTED', firstTouchedAt: new Date() },
  })
  if (pick([repeat]).length === 0) pass('a missed repeat call whose original was contacted is handled')
  else fail('a duplicate row (status NEW for ever) put a dealt-with person back on the list')

  const open = row({ minsAgo: 5, duplicateOfLeadId: 'canon2', duplicateOf: { status: 'NEW', firstTouchedAt: null } })
  const got = pick([open])
  if (got.length === 1 && got[0].leadId === 'canon2') pass('"Done" targets the canonical lead, not the duplicate')
  else fail(`wrong lead id for Done: ${JSON.stringify(got)}`)
}

console.log('\nLATEST CALL WINS: someone who got through later has been spoken to')
{
  const missedThenAnswered = [row({ minsAgo: 60 }), row({ minsAgo: 10, callStatus: 'completed' })]
  if (pick(missedThenAnswered).length === 0) pass('missed at 5pm, answered at 5:50 → nothing to do')
  else fail('told the shop to ring back somebody they have already spoken to')
  const answeredThenMissed = [row({ minsAgo: 60, callStatus: 'completed' }), row({ minsAgo: 10 })]
  if (pick(answeredThenMissed).length === 1) pass('answered earlier, then a missed call → ring back')
  else fail('an earlier answered call hid a later missed one')
}

console.log('\nONE ROW PER PERSON, at their latest attempt')
{
  const got = pick([row({ minsAgo: 90 }), row({ minsAgo: 40, callStatus: 'busy' }), row({ minsAgo: 5 })])
  if (got.length === 1 && got[0].at === new Date(NOW - 5 * 60_000).toISOString()) {
    pass('three missed calls from one number → one call-back, the newest')
  } else fail(`one person listed ${got.length} times`)
  const two = pick([row({ minsAgo: 5 }), row({ minsAgo: 6, phone: '+15125550199' })])
  if (two.length === 2) pass('two different people → two rows')
  else fail('different callers were merged')
  const withheld = pick([row({ minsAgo: 5, phone: null }), row({ minsAgo: 6, phone: null })])
  if (withheld.length === 2) pass('withheld numbers are not merged into one "person"')
  else fail('every withheld caller was collapsed into one row')
}

console.log('\nEvery missed kind is a call-back, including failed')
{
  for (const status of ['no-answer', 'busy', 'canceled', 'failed']) {
    if (pick([row({ minsAgo: 5, callStatus: status, phone: `+1512555${status.length}000` })]).length === 1) {
      pass(`${status} → listed`)
    } else fail(`${status} dropped off the call-back list`)
  }
}

console.log(
  failures === 0
    ? '\nAll portal-menu checks passed.'
    : `\n${failures} portal-menu check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
