/**
 * The insurance-claim landing page.
 *
 * Run: npx tsx scripts/check-insurance-program.ts
 *
 * WHAT GOES WRONG HERE IS SILENT IN BOTH DIRECTIONS, which is why the checks
 * that assert on ABSENCE come first.
 *
 * Too lenient and the page states a fact about somebody's insurance that
 * nobody here knows — § 2's invented fact, on a real business's site, about
 * money a customer is counting on. Worse, the network claim is the one thing
 * § 2 bans outright ("no approved by / preferred provider"), and it renders
 * perfectly whether or not anybody checked it.
 *
 * Too eager and the page publishes empty: the ad keeps running, the click
 * still costs the same, and what it lands on is the ordinary page with a
 * different headline. That is not a broken page — it looks completely fine —
 * and the whole reason this page type exists is to stop that being true.
 *
 * THE CONTRADICTION CHECK IS THE ONE NOTHING ELSE WOULD CATCH. The insurance
 * band's small print says "not affiliated with or endorsed by any insurance
 * company", on every page. A shop in an insurer's repair network publishing
 * both halves has published a contradiction, and it is invisible from either
 * page on its own.
 */

import {
  INSURANCE_PROGRAMS,
  affiliationLine,
  coverageBody,
  networkSentence,
  programFor,
  programForPath,
  programIsPublished,
  programSections,
  programTitle,
  publishProblem,
  readProgramRecord,
  readSteps,
  suggestedProgram,
  PROGRAM_PATHS,
  type ProgramCopyContext,
  type ProgramRecord,
} from '../src/lib/insurance-programs'
import { pathOverrideProblem } from '../src/lib/site-paths'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const record = (over: Partial<ProgramRecord> = {}): ProgramRecord => ({
  programKey: 'icbc',
  inNetwork: false,
  coverageNote: null,
  claimSteps: [],
  metaDescription: null,
  publishedAt: null,
  ...over,
})

// AGS, the client this was built for: a BC shop whose ICBC ad group was
// pointed at a bare home page.
const AGS: ProgramCopyContext = {
  businessName: 'AGS Affordable Glass Services',
  area: 'the Lower Mainland',
  state: 'BC',
  filesClaims: true,
  mobile: true,
}
// A Texas shop with no programme of its own — the other fourteen.
const US: ProgramCopyContext = {
  businessName: 'NorthStar Auto Glass',
  area: 'Dallas–Fort Worth',
  state: 'TX',
  filesClaims: false,
  mobile: true,
}

console.log('\nThe page says NOTHING about a network nobody ticked')
{
  const body = programSections(INSURANCE_PROGRAMS.icbc, record(), AGS)
    .map((s) => `${s.heading} ${s.body}`)
    .join(' ')
  if (!/Repair Network|network/i.test(body)) pass('no network claim without the tick')
  else fail(`claimed a network on an unticked record: ${body.slice(0, 160)}`)
  if (!/approved|preferred|endorse|authoris|authoriz/i.test(body)) {
    pass('no approved-by / preferred-provider wording anywhere in the body')
  } else fail('the body carries an endorsement claim')
}

console.log('\nA TICK ON A PROGRAMME WITH NO CONFIRMED NETWORK NAME RENDERS NOTHING')
{
  // The trap: SGI and MPI are real programmes whose network names this
  // platform has not confirmed. A tick there must not produce a hedge — an
  // unfalsifiable membership claim is worse than none.
  for (const key of ['sgi', 'mpi'] as const) {
    const program = INSURANCE_PROGRAMS[key]
    const said = networkSentence(program, record({ programKey: key, inNetwork: true }), AGS)
    if (said === '') pass(`${program.short}: ticked, and still says nothing`)
    else fail(`${program.short} invented a network name: ${said}`)
  }
}

console.log('\nTicked on ICBC, it is MEMBERSHIP and never endorsement')
{
  const said = networkSentence(INSURANCE_PROGRAMS.icbc, record({ inNetwork: true }), AGS)
  if (/is part of the ICBC Repair Network/.test(said)) pass(said)
  else fail(`expected a membership sentence, got: ${said || '(nothing)'}`)
  if (/approved|preferred|endorse|recommend/i.test(said)) {
    fail('the membership sentence reads as an endorsement')
  } else pass('no endorsement verb in it')
}

console.log('\nTHE AFFILIATION LINE CANNOT CONTRADICT THE NETWORK CLAIM')
{
  // Every page prints this. Both halves published is the failure that is
  // invisible from either page on its own.
  const withNetwork = affiliationLine(INSURANCE_PROGRAMS.icbc, record({ inNetwork: true }))
  if (!/not affiliated with or endorsed by any insurance company/.test(withNetwork)) {
    pass('the blanket "not affiliated" sentence is gone where the network is claimed')
  } else fail(`the site claims the network AND denies any affiliation: ${withNetwork}`)
  if (/choice of repair shop is yours to make/.test(withNetwork)) {
    pass("the driver's statutory choice of shop survives — that is the half that matters")
  } else fail('dropped the statutory choice-of-shop sentence')
  if (/not an endorsement/.test(withNetwork)) pass('and it says the network is not an endorsement')
  else fail('does not disclaim endorsement')

  // Fourteen of fifteen shops, and a shop with the page but no tick: byte for
  // byte what it has always been.
  const DEFAULT =
    'We are an independent auto glass company and are not affiliated with or endorsed by any insurance company. Your choice of repair shop is yours to make.'
  for (const [label, line] of [
    ['no programme at all', affiliationLine(null, null)],
    ['a programme with the tick off', affiliationLine(INSURANCE_PROGRAMS.icbc, record())],
    [
      'a tick on a programme with no confirmed network',
      affiliationLine(INSURANCE_PROGRAMS.sgi, record({ programKey: 'sgi', inNetwork: true })),
    ],
  ] as const) {
    if (line === DEFAULT) pass(`unchanged for ${label}`)
    else fail(`changed the disclaimer for ${label}: ${line}`)
  }
}

console.log('\nA NAMED INSURER WITH NOTHING TYPED RENDERS NO COVERAGE SECTION')
{
  // Nothing here knows what ICBC covers. Silence is the only correct output.
  const body = coverageBody(INSURANCE_PROGRAMS.icbc, record(), AGS)
  if (body === '') pass('no coverage claim invented for ICBC')
  else fail(`invented coverage copy: ${body.slice(0, 160)}`)

  const headings = programSections(INSURANCE_PROGRAMS.icbc, record(), AGS).map((s) => s.heading)
  if (!headings.some((h) => /covers/i.test(h))) pass('and the section strips itself rather than sitting empty')
  else fail(`an empty coverage section rendered: ${headings.join(' / ')}`)
}

console.log('\nThe GENERAL page is complete with nothing typed — that is its whole point')
{
  const body = coverageBody(INSURANCE_PROGRAMS.general, record({ programKey: 'general' }), US)
  if (body.length > 80) pass('coverage copy is present from the reviewed per-state rule')
  else fail('the general page had no coverage copy, so it is as empty as a named one')
  // It is the SAME reviewed text the insurance band prints. A second version
  // of a compliance-reviewed paragraph is the shape this codebase refuses.
  if (/comprehensive/.test(body)) pass('it is the insurance-rules copy, not a new one')
  else fail(`does not look like the reviewed rule: ${body.slice(0, 120)}`)
  // And it must carry Florida's windshield-only caveat where that applies,
  // because the rule module is what supplies it.
  const fl = coverageBody(
    INSURANCE_PROGRAMS.general,
    record({ programKey: 'general' }),
    { ...US, state: 'FL' }
  )
  if (/Door glass and back glass/.test(fl)) pass('Florida keeps its windshield-only caveat')
  else fail('lost the per-state caveat on the general page')
}

console.log('\nPUBLISHING IS REFUSED WHILE THERE IS NOTHING PROGRAMME-SPECIFIC')
{
  const empty = record()
  const problem = publishProblem(empty)
  if (problem && /ICBC/.test(problem)) pass(problem.slice(0, 92) + '…')
  else fail(`an empty ICBC page was publishable: ${problem || '(no problem reported)'}`)

  if (!programIsPublished({ ...empty, publishedAt: new Date() })) {
    pass('and a publishedAt stamp on an empty record still does not count as published')
  } else fail('a stamped-but-empty page would be linked and listed in the sitemap')

  const filled = record({ coverageNote: 'ICBC covers glass under comprehensive.' })
  if (!publishProblem(filled)) pass('one real coverage note is enough to publish')
  else fail(`refused a filled record: ${publishProblem(filled)}`)

  if (publishProblem(record({ claimSteps: ['Call us'] }))) {
    pass('one lone step is refused — a single step is not a process')
  } else fail('published a one-step "process"')

  if (!publishProblem(record({ claimSteps: ['Call us', 'We book it'] }))) {
    pass('two steps are a process')
  } else fail('refused a two-step process')

  // The general page has no gate at all, and that asymmetry is deliberate.
  if (!publishProblem(record({ programKey: 'general' }))) {
    pass('the general page publishes untouched, because its body is already written')
  } else fail('the general page was gated like a named one, so it would stay a draft forever')
}

console.log('\nThe filesInsuranceClaims flag gates the same sentence it gates everywhere else')
{
  const on = programSections(INSURANCE_PROGRAMS.general, record({ programKey: 'general' }), {
    ...US,
    filesClaims: true,
  })
    .map((s) => s.body)
    .join(' ')
  const off = programSections(INSURANCE_PROGRAMS.general, record({ programKey: 'general' }), {
    ...US,
    filesClaims: false,
  })
    .map((s) => s.body)
    .join(' ')
  if (/deal with your carrier directly/.test(on)) pass('claims-filing shop says it deals with the carrier')
  else fail('a claims-filing shop did not say so')
  if (!/deal with your carrier directly/.test(off)) {
    pass('a shop that does NOT file claims never says it does')
  } else fail('claimed claims handling for a shop that does not do it')
}

console.log('\nNo timing promise, no price, no deductible waiver anywhere in the structural copy')
{
  // § 2, on the half of the page this module writes rather than an operator.
  const all = [INSURANCE_PROGRAMS.general, INSURANCE_PROGRAMS.icbc, INSURANCE_PROGRAMS.sgi]
    .map((p) =>
      programSections(p, record({ programKey: p.key }), { ...AGS, state: 'TX' })
        .map((s) => `${s.heading} ${s.body}`)
        .join(' ')
    )
    .join(' ')
  const traps: Array<[RegExp, string]> = [
    [/same[- ]day|within (an?|the|\d+)\s*(hour|minute|day)|\b30 minutes\b/i, 'timing promise'],
    [/we pay your deductible|deductible waived|free windshield|no cost to you/i, 'deductible-waiver offer'],
    [/\$\d/, 'price'],
    [/\bapproved by\b|\bpreferred provider\b/i, 'endorsement claim'],
  ]
  for (const [re, what] of traps) {
    const hit = all.match(re)
    if (!hit) pass(`no ${what} anywhere`)
    else fail(`${what} in the structural copy: “${hit[0]}”`)
  }
}

console.log('\nAddresses: one per page, and reserved against everything else')
{
  for (const path of PROGRAM_PATHS) {
    const bare = path.slice(1)
    if (programForPath(bare)) pass(`${path} resolves to its programme`)
    else fail(`${path} does not resolve`)
    // A page moved onto this address would be accepted and then shadowed the
    // moment somebody switched the insurance page on.
    const refused = pathOverrideProblem(path, '/windshield-replacement', [])
    if (refused) pass(`${path} is refused as a path override`)
    else fail(`${path} was accepted as an override for another page`)
  }
  if (!programForPath('windshield-replacement')) pass('an ordinary service slug is not a programme')
  else fail('a service slug resolved as a programme page')
  if (!programForPath('insurance/glass')) pass('a nested path is not a programme')
  else fail('a nested path resolved as a programme page')
}

console.log('\nThe province suggests, and never decides')
{
  if (suggestedProgram('BC').key === 'icbc') pass('BC suggests ICBC')
  else fail('BC did not suggest ICBC')
  if (suggestedProgram('SK').key === 'sgi') pass('SK suggests SGI')
  else fail('SK did not suggest SGI')
  if (suggestedProgram('TX').key === 'general') pass('a US state suggests the general page')
  else fail('a US state suggested a Canadian programme')
  if (suggestedProgram(null).key === 'general') pass('no state suggests the general page')
  else fail('a missing state suggested something specific')
}

console.log('\nReading the stored row')
{
  if (readProgramRecord(null) === null) pass('no row is no page')
  else fail('conjured a page out of a missing row')
  if (readProgramRecord({ programKey: 'aviva' }) === null) {
    pass('an unknown programme key is no page — a free-text insurer name cannot sneak in')
  } else fail('accepted an insurer this platform has no catalogue entry for')
  const read = readProgramRecord({
    programKey: 'ICBC',
    inNetwork: 'yes',
    coverageNote: '   ',
    claimSteps: ['  Call us  ', '', 42, 'We book it'],
  })
  if (read?.programKey === 'icbc') pass('the key is normalised')
  else fail(`key not normalised: ${read?.programKey}`)
  if (read?.inNetwork === false) {
    pass('a truthy non-true inNetwork is false — this claim is opt-in, strictly')
  } else fail('"yes" was read as a ticked network claim')
  if (read?.coverageNote === null) pass('whitespace is no coverage note')
  else fail('whitespace became a coverage note')
  if (read?.claimSteps.join('|') === 'Call us|We book it') pass('steps are trimmed and junk dropped')
  else fail(`steps read wrong: ${JSON.stringify(read?.claimSteps)}`)
  if (readSteps(Array(20).fill('x')).length === 8) pass('steps are capped at what the page renders')
  else fail('more steps than the page can render were kept')
}

console.log('\nThe headline names the AREA, not the address')
{
  const title = programTitle(INSURANCE_PROGRAMS.icbc, AGS)
  if (title === 'ICBC glass claims in the Lower Mainland') pass(title)
  else fail(`headline wrong: ${title}`)
  const general = programTitle(INSURANCE_PROGRAMS.general, US)
  if (!/\bgeneral\b/i.test(general) && /Insurance glass claims/.test(general)) {
    pass(`${general} — the general page names no insurer, and does not call itself "general"`)
  } else fail(`the general page's headline leaked its key: ${general}`)
}

console.log('\nEvery catalogue entry is coherent')
{
  for (const [key, p] of Object.entries(INSURANCE_PROGRAMS)) {
    if (p.key !== key) fail(`${key} carries key ${p.key}`)
    if (programFor(key)?.slug !== p.slug) fail(`${key} does not resolve to itself`)
    if (!/^[a-z0-9-]+$/.test(p.slug)) fail(`${key} has a slug that is not a flat address: ${p.slug}`)
    // A named insurer must be gated; the general page must not be.
    if ((key !== 'general') !== p.needsTypedCoverage) {
      fail(`${key} has the wrong coverage gate`)
    }
  }
  const slugs = Object.values(INSURANCE_PROGRAMS).map((p) => p.slug)
  if (new Set(slugs).size === slugs.length) pass('no two programmes share an address')
  else fail('two programmes claim the same address')
  if (failures === 0) pass('catalogue entries are self-consistent')
}

console.log(
  failures === 0
    ? '\nAll insurance-programme checks passed.'
    : `\n${failures} insurance-programme check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
