/**
 * What the dashboard is allowed to show a red cross for.
 *
 * Run: npx tsx scripts/check-client-health.ts
 *
 * THE SILENT DIRECTION IS THE ONE THAT MATTERS HERE, and it is the opposite of
 * the usual one. A missed failure costs one client one thing. A cross against
 * something that is not broken costs the whole board: a self-serve shop has no
 * ad account and never will, so marking that red puts most of the book
 * permanently in red, and a status page that is always red is a status page
 * nobody opens — including on the morning it is telling the truth. That is the
 * same reasoning `client-readiness.ts` gives for not reporting optional checks
 * and `call-connect-health.ts` for firing only on `failed`.
 *
 * So the rule these assertions exist to hold is: A CROSS ALWAYS MEANS SOMEBODY
 * HAS SOMETHING TO DO. Anything that does not apply is a dash.
 */

import { healthCells, type HealthInput } from '../src/lib/client-health'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const NOW = new Date('2026-09-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

/** A client with nothing configured and nothing wrong. */
const base: HealthInput = {
  status: 'ACTIVE',
  siteSubdomain: 'demo',
  callCoachingEnabled: true,
  adsTracking: null,
  trackingNumbers: [],
  readiness: { requiredOpen: 0, recommendedOpen: 0, checks: [] },
  calls: [],
  findings: { alerts: 0, total: 0 },
  now: NOW,
}

const cells = (over: Partial<HealthInput>) => healthCells({ ...base, ...over })

const expect = (label: string, got: string, want: string) =>
  got === want ? pass(`${label}: ${got}`) : fail(`${label}: got ${got}, want ${want}`)

console.log('\nA dash is not a failure')
{
  const c = cells({})
  expect('no ad tag at all → ads', c.ads.state, 'na')
  expect('no tracking number → calls', c.calls.state, 'na')
  expect('no tracking number → recording', c.recording.state, 'na')
  expect('no tracking number → texts', c.sms.state, 'na')
  // The reason each dash exists has to be readable, or it looks like a gap.
  for (const id of ['ads', 'calls', 'recording', 'sms'] as const) {
    if (c[id].detail.trim().length > 10) pass(`the ${id} dash explains itself`)
    else fail(`the ${id} dash says nothing — it will read as a bug`)
  }
}

console.log('\nPaused is a decision, not a fault')
{
  const c = cells({ status: 'PAUSED' })
  expect('paused → site', c.site.state, 'na')
  const live = cells({ status: 'ONBOARDING' })
  // ONBOARDING sites are live and taking leads on purpose — the mistake the
  // rank module and the WRHQ sync both made by testing `=== 'ACTIVE'`.
  expect('ONBOARDING is live → site', live.site.state, 'ok')
  expect('live but no subdomain → site', cells({ siteSubdomain: null }).site.state, 'bad')
}

console.log('\nTexts: read what we recorded, never infer from silence')
{
  const num = { active: true, recordCalls: true, smsUrl: null, forwardTo: '+15559990000' }
  expect('number with no SmsUrl on record', cells({ trackingNumbers: [num] }).sms.state, 'bad')
  expect(
    'number we pointed at the app',
    cells({ trackingNumbers: [{ ...num, smsUrl: 'https://x/api/webhooks/twilio/sms' }] }).sms.state,
    'ok'
  )
  /* THE TRAP. A configured number nobody has texted and an unconfigured one
     that swallowed every text look identical from the message table, which is
     exactly why this column may not be derived from it. Busy call history must
     not make the SMS cell go green. */
  const busy = cells({
    trackingNumbers: [num],
    calls: Array.from({ length: 20 }, (_, i) => ({
      at: hoursAgo(i + 3),
      status: 'completed',
      seconds: 120,
      recorded: true,
      line: '+15550001000',
    })),
  })
  expect('20 answered calls do NOT vouch for the SmsUrl', busy.sms.state, 'bad')
  // An inactive number is not a number: it routes nothing, so it owes nothing.
  expect(
    'inactive number only → texts',
    cells({ trackingNumbers: [{ ...num, active: false }] }).sms.state,
    'na'
  )
  const partial = cells({
    trackingNumbers: [num, { ...num, smsUrl: 'https://x/api/webhooks/twilio/sms' }],
  })
  expect('one of two unpointed', partial.sms.state, 'bad')
  if (partial.sms.badge === '1') pass('the cell counts how many are unpointed')
  else fail(`expected a badge of 1, got ${partial.sms.badge}`)
}

console.log('\nAds: only judged once a tag is actually loading')
{
  const tag = { conversionId: 'AW-1', leadConversionLabel: null, bingUetTagId: null, bingLeadEventAction: null }
  expect('Google tag, no conversion label', cells({ adsTracking: tag }).ads.state, 'bad')
  expect(
    'Google tag with a label',
    cells({ adsTracking: { ...tag, leadConversionLabel: 'abc' } }).ads.state,
    'ok'
  )
  expect(
    'Bing tag, no event action',
    cells({ adsTracking: { conversionId: null, leadConversionLabel: null, bingUetTagId: '1', bingLeadEventAction: null } }).ads.state,
    'bad'
  )
  // The self-serve tier is not a fault. This is the assertion that keeps most
  // of the book out of permanent red.
  expect(
    'no tag configured at all',
    cells({ adsTracking: { conversionId: null, leadConversionLabel: null, bingUetTagId: null, bingLeadEventAction: null } }).ads.state,
    'na'
  )
}

console.log('\nSetup, and the difference between required and recommended')
{
  const withChecks = (requiredOpen: number, recommendedOpen: number) =>
    cells({
      readiness: {
        requiredOpen,
        recommendedOpen,
        checks: [
          { id: 'logo', label: 'Logo', ok: requiredOpen === 0, detail: 'x', severity: 'required', href: '#' },
          { id: 'photos', label: 'Photos', ok: recommendedOpen === 0, detail: 'x', severity: 'recommended', href: '#' },
        ],
      },
    })
  expect('required outstanding', withChecks(1, 0).setup.state, 'bad')
  expect('only recommended left', withChecks(0, 1).setup.state, 'warn')
  expect('nothing outstanding', withChecks(0, 0).setup.state, 'ok')
  if (withChecks(3, 0).setup.badge === '3') pass('the count rides on the cell')
  else fail('the setup cell lost its count')
  // A failed read is reported as a failed read. Rendering it green is the
  // all-clear-over-an-error mistake the sweeps refuse to make.
  expect('readiness unreadable', cells({ readiness: null }).setup.state, 'warn')
  expect('readiness unreadable → leads', cells({ readiness: null }).leads.state, 'warn')
}

console.log('\nFindings')
{
  expect('none open', cells({ findings: { alerts: 0, total: 0 } }).findings.state, 'ok')
  expect('reviews only', cells({ findings: { alerts: 0, total: 4 } }).findings.state, 'warn')
  expect('an alert open', cells({ findings: { alerts: 1, total: 4 } }).findings.state, 'bad')
  expect('query failed', cells({ findings: null }).findings.state, 'warn')
}

console.log('\nCalls: the same evaluator the morning sweep uses')
{
  const num = { active: true, recordCalls: true, smsUrl: 'x', forwardTo: '+15559990000' }
  const make = (status: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      at: hoursAgo(i + 3),
      status,
      seconds: status === 'completed' ? 90 : 0,
      recorded: true,
      line: '+15550001000',
    }))

  // Too few to judge is a dash, not a pass and not a fault.
  expect('one call in the window', cells({ trackingNumbers: [num], calls: make('failed', 1) }).calls.state, 'na')
  expect('every call failed', cells({ trackingNumbers: [num], calls: make('failed', 6) }).calls.state, 'bad')
  /* A busy line is a busy shop, and firing on it files a finding against every
     shop that has ever been engaged. One answered call proves the line works. */
  const busyWithProof = cells({
    trackingNumbers: [num],
    calls: [...make('busy', 5), ...make('completed', 1)],
  })
  expect('busy, but one call connected', busyWithProof.calls.state, 'ok')
  expect(
    'answered calls, all recorded',
    cells({ trackingNumbers: [num], calls: make('completed', 6) }).recording.state,
    'ok'
  )
  // A call from ten minutes ago has not had time to produce a recording.
  const tooFresh = cells({
    trackingNumbers: [num],
    calls: Array.from({ length: 6 }, () => ({
      at: new Date(NOW.getTime() - 10 * 60_000),
      status: 'completed',
      seconds: 90,
      recorded: false,
      line: '+15550001000',
    })),
  })
  expect('calls too recent to have recordings', tooFresh.recording.state, 'na')
  expect(
    'recording switched off',
    cells({ trackingNumbers: [{ ...num, recordCalls: false }], calls: make('completed', 6) }).recording.state,
    'na'
  )
}

console.log('\nA clean client is clean')
{
  const c = cells({
    trackingNumbers: [{ active: true, recordCalls: true, smsUrl: 'https://x/api/webhooks/twilio/sms', forwardTo: '+1555' }],
    adsTracking: { conversionId: 'AW-1', leadConversionLabel: 'abc', bingUetTagId: null, bingLeadEventAction: null },
  })
  const red = Object.entries(c).filter(([, cell]) => cell.state === 'bad')
  if (red.length === 0) pass('nothing wrong, nothing red')
  else fail(`a healthy client showed red: ${red.map(([k]) => k).join(', ')}`)
}

console.log(
  failures === 0
    ? '\nAll client-health checks passed.'
    : `\n${failures} client-health check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
