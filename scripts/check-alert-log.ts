/**
 * Who a lead alert goes to, and why nobody when it is nobody.
 *
 *   npx tsx scripts/check-alert-log.ts
 *
 * The silent cases first: each of the ways an alert reaches nobody must name
 * itself, because "we didn't get notified" (MAG Mobile) is only answerable if
 * the record says which one it was. Then the ordinary sends are unchanged.
 */
import { alertPlan, describeAlert, type AlertSettings } from '../src/lib/alert-plan'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const base: AlertSettings = {
  emailEnabled: true,
  emailTo: ['shop@example.com'],
  emailCallLeads: true,
  smsEnabled: true,
  smsTo: ['+14075550100'],
}
const call = { isCall: true }
const form = { isCall: false }

console.log('\nEVERY WAY TO REACH NOBODY SAYS WHICH')
{
  const p = alertPlan(null, call, 'urgent')
  check(!p.emails.length && !p.numbers.length && /no alert settings/.test(p.noEmail || ''), `no settings row: ${p.noEmail}`)
}
{
  const p = alertPlan({ ...base, emailEnabled: false }, form, 'urgent')
  check(!p.emails.length && p.noEmail === 'email alerts are switched off', `email off: ${p.noEmail}`)
}
{
  const p = alertPlan({ ...base, emailCallLeads: false }, call, 'record')
  check(!p.emails.length && /calls and texts are switched off/.test(p.noEmail || ''), `answered call, call emails off: ${p.noEmail}`)
  check(!p.numbers.length && /record/.test(p.noSms || ''), `…and no text, by design: ${p.noSms}`)
  check(/no email/.test(describeAlert({ at: '', via: 'call', kind: 'record', emailTo: [], emailSent: 0, smsTo: [], smsSent: 0, errors: [], noEmail: p.noEmail, noSms: p.noSms })), 'the sentence says an answered call reached nobody and why')
}
{
  const p = alertPlan({ ...base, emailTo: ['  ', ''] }, form, 'urgent')
  check(!p.emails.length && p.noEmail === 'no email address is set', `blank addresses: ${p.noEmail}`)
}
{
  const p = alertPlan({ ...base, smsEnabled: false }, call, 'urgent')
  check(!p.numbers.length && p.noSms === 'the SMS add-on is not switched on', `missed call, no SMS add-on: ${p.noSms}`)
  check(p.emails.length === 1, '…and the email still goes')
}
{
  const p = alertPlan({ ...base, smsTo: [] }, call, 'urgent')
  check(!p.numbers.length && p.noSms === 'no number is set for texts', `add-on on, no number: ${p.noSms}`)
}
check(
  describeAlert({ at: '', via: 'call', kind: 'urgent', emailTo: [], emailSent: 0, smsTo: [], smsSent: 0, errors: [], skipped: 'already heard from +1407 today' }) ===
    'Not alerted — already heard from +1407 today',
  'a same-day repeat says so rather than reading as a failure'
)
check(
  /no shop device/.test(
    describeAlert({ at: '', via: 'call', kind: 'urgent', emailTo: ['a@b'], emailSent: 1, smsTo: [], smsSent: 0, errors: [], pushShop: { sent: 0, failed: 0 } })
  ),
  'a push to nobody says no shop device has alerts on'
)

console.log('\nTHE ORDINARY SENDS ARE UNCHANGED')
{
  const p = alertPlan(base, call, 'urgent')
  check(p.emails.length === 1 && p.numbers.length === 1 && !p.noEmail && !p.noSms, 'missed call: email and text')
}
{
  const p = alertPlan(base, call, 'record')
  check(p.emails.length === 1 && p.numbers.length === 0, 'answered call: email only')
}
{
  const p = alertPlan({ ...base, emailCallLeads: false }, form, 'urgent')
  check(p.emails.length === 1, 'call emails off does not touch form emails')
}
{
  const p = alertPlan({ ...base, emailCallLeads: false }, call, 'urgent')
  check(p.emails.length === 0 && p.numbers.length === 1, 'call emails off: a missed call still texts')
}
check(
  describeAlert({ at: '', via: 'call', kind: 'urgent', emailTo: ['a@b'], emailSent: 1, smsTo: ['+1407'], smsSent: 1, errors: [], pushShop: { sent: 2, failed: 0 } }) ===
    'emailed a@b; texted +1407; pushed to 2 shop devices',
  'a full send reads plainly'
)

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
