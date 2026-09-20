/**
 * Does the rendered page actually dial the tracking number?
 *
 * Run: npx tsx scripts/check-site-phone-audit.ts
 *
 * `check-site-phone.ts` holds what the LIBRARY returns. This holds what the
 * PAGE carries, which is a different question and the one that has never been
 * asked: the swap is correct by construction right up until a component reads
 * `client.phone` before it, a kept page brings the old site's markup with it,
 * or `useOnSite` is simply never ticked. Every one of those renders a valid
 * page with the shop's own line on it, and the only symptom is paid clicks
 * landing somewhere nothing records.
 *
 * BOTH DIRECTIONS, and the quiet one is expensive in the usual way. Too
 * lenient and the calls the ads bought go unmeasured for months with nothing
 * red anywhere. Too eager and it fires on the LocalBusiness schema, which is
 * deliberately NOT swapped — a finding telling somebody to "fix" the schema
 * phone would have them break the NAP signal local ranking leans on.
 */

import {
  auditPhones,
  findWrongLinks,
  pagesWithNoCallLink,
  trackingNumbersInSchema,
  NOT_ON_SITE_CHECK,
  PHONE_RENDER_CHECK,
  SCHEMA_PHONE_CHECK,
  type PhoneAuditInput,
} from '../src/lib/site-phone-audit'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const TRACKED = '(689) 366-6860'
const REAL = '(714) 582-1740'

/** A page shaped like the real template: header, mobile bar, footer, schema. */
const goodPage = (path: string) => ({
  path,
  html: `<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"AutoRepair","telephone":"+17145821740","name":"Auto Glass Kings"}</script>
    </head><body>
    <header><a href="tel:+16893666860">(689) 366-6860</a></header>
    <main>
      <a href="tel:+16893666860" class="cta">Call now</a>
      <a href="sms:+16893666860?&amp;body=Photo%20of%20the%20damage">Text a photo</a>
    </main>
    <footer><a href="tel:+16893666860">(689) 366-6860</a></footer>
    </body></html>`,
})

const base: PhoneAuditInput = {
  displayNumber: TRACKED,
  trackingNumbers: [TRACKED],
  realPhone: REAL,
  hasActiveNumberButNoneOnSite: false,
  pages: [goodPage('/'), goodPage('/windshield-replacement')],
}

const audit = (over: Partial<PhoneAuditInput>) => auditPhones({ ...base, ...over })

console.log('\nA correctly swapped site is silent')
{
  const { judged, drafts } = audit({})
  if (judged) pass('judged — pages were read, so a fix can resolve the finding')
  else fail('a site whose pages were read was not judged')
  if (drafts.length === 0) pass('nothing filed against a correct page')
  else fail(`fired on a correct page: ${drafts.map((d) => d.title).join(' | ')}`)
  /* THE ONE THAT MUST STAY SILENT. The schema carries the REAL number on
     every one of these pages, on purpose. A check that read it as a rogue
     number would have somebody "fix" the thing that keeps the Business
     Profile and the site agreeing. */
  if (trackingNumbersInSchema(base).length === 0)
    pass('the real number in the LocalBusiness schema is left alone')
  else fail('fired on the schema phone, which is deliberately not swapped')
}

console.log('\nThe shop’s own line in a call link')
{
  const leaked = {
    path: '/contact',
    html: '<a href="tel:+17145821740">Call (714) 582-1740</a>',
  }
  const wrong = findWrongLinks({ ...base, pages: [leaked] })
  if (wrong.length === 1 && wrong[0].isShopLine) pass('caught, and known to be the shop’s own line')
  else fail(`missed the shop line in a tel: link: ${JSON.stringify(wrong)}`)

  const { drafts } = audit({ pages: [goodPage('/'), leaked] })
  const d = drafts.find((x) => x.check === PHONE_RENDER_CHECK)
  if (d?.severity === 'ALERT') pass('ALERT: every ad click on that page is unmeasured')
  else fail(`expected an ALERT, got ${d?.severity}`)
  if (d && d.detail.includes('/contact')) pass('the finding names the page')
  else fail('the finding does not say which page')
}

console.log('\nAn sms: link is INBOUND too — that reversal is the whole point')
{
  const smsToHandset = {
    path: '/',
    html: '<a href="tel:+16893666860">Call</a><a href="sms:+17145821740?&amp;body=hi">Text us</a>',
  }
  const wrong = findWrongLinks({ ...base, pages: [smsToHandset] })
  if (wrong.some((w) => w.scheme === 'sms')) pass('an sms: to the shop’s handset is caught')
  else fail('an sms: link to the untracked line went unnoticed')
}

console.log('\nA third number is odd, not the swap failing')
{
  const stranger = { path: '/thank-you', html: '<a href="tel:+19497751661">Call</a>' }
  const d = audit({ pages: [goodPage('/'), stranger] }).drafts.find(
    (x) => x.check === PHONE_RENDER_CHECK
  )
  // REVIEW, not ALERT: worth reading, but it is not the tracked/untracked
  // swap going wrong, and crying ALERT at everything empties the word.
  if (d?.severity === 'REVIEW') pass('REVIEW for a number that is nobody’s line here')
  else fail(`expected REVIEW for a third number, got ${d?.severity}`)
}

console.log('\nOne fault, one finding')
{
  // Header, mobile bar and footer all carrying the same wrong number is ONE
  // thing to fix. Three rows would be three dismissals for one edit.
  const thrice = {
    path: '/',
    html: '<a href="tel:+17145821740">a</a><a href="tel:+17145821740">b</a><a href="tel:+17145821740">c</a>',
  }
  const wrong = findWrongLinks({ ...base, pages: [thrice] })
  if (wrong.length === 1) pass('three copies of one wrong number collapse to one row')
  else fail(`expected 1 row, got ${wrong.length}`)
}

console.log('\nA page with no call link at all')
{
  const silent = { path: '/kept-page', html: '<h1>About us</h1><p>No number anywhere.</p>' }
  if (pagesWithNoCallLink({ ...base, pages: [silent] }).length === 1)
    pass('a page nobody can ring from is reported')
  else fail('a page with no tel: link went unreported')
  if (pagesWithNoCallLink(base).length === 0) pass('normal pages are not reported')
  else fail('fired on pages that do have call links')
}

console.log('\nA tracking number in the schema is the OPPOSITE fault')
{
  const swappedSchema = {
    path: '/',
    html: `<script type="application/ld+json">{"telephone":"+16893666860"}</script><a href="tel:+16893666860">Call</a>`,
  }
  const found = trackingNumbersInSchema({ ...base, pages: [swappedSchema] })
  if (found.length === 1) pass('a tracked number in the markup is caught')
  else fail('the schema was swapped and nothing noticed')
  const d = audit({ pages: [swappedSchema] }).drafts.find((x) => x.check === SCHEMA_PHONE_CHECK)
  if (d && /NAP|Business Profile/i.test(d.detail)) pass('the finding explains why it matters')
  else fail('the schema finding does not say why a tracked number there is wrong')
  // A "telephone" key OUTSIDE JSON-LD is not the schema and must not count.
  const notSchema = {
    path: '/',
    html: '<div data-x=\'{"telephone":"+16893666860"}\'></div><a href="tel:+16893666860">Call</a>',
  }
  if (trackingNumbersInSchema({ ...base, pages: [notSchema] }).length === 0)
    pass('a telephone key outside JSON-LD is ignored')
  else fail('read a telephone key that was not in a JSON-LD block')
}

console.log('\nThe switch nobody ticked — no pages needed')
{
  const { judged, drafts } = auditPhones({
    ...base,
    hasActiveNumberButNoneOnSite: true,
    pages: [],
  })
  const d = drafts.find((x) => x.check === NOT_ON_SITE_CHECK)
  if (d?.severity === 'ALERT') pass('ALERT: they are paying for a number the site does not show')
  else fail(`expected an ALERT for an unused tracking number, got ${d?.severity}`)
  /* Judged FALSE because no page was read. The switch finding still files —
     it needs nothing fetched — but the page checks must not resolve on a
     morning the site could not be reached. */
  if (!judged) pass('no pages read → not judged, so nothing auto-resolves')
  else fail('claimed to have judged the pages without reading any')
}

console.log('\nNo tracking number at all')
{
  // The shop's own line IS the display number then, and every link to it is
  // correct. This is the majority of the book and must be silent.
  const selfServe = auditPhones({
    displayNumber: REAL,
    trackingNumbers: [],
    realPhone: REAL,
    hasActiveNumberButNoneOnSite: false,
    pages: [{ path: '/', html: '<a href="tel:+17145821740">Call</a>' }],
  })
  if (selfServe.drafts.length === 0) pass('a client with no tracking number is left alone')
  else fail(`fired on a client with no tracking number: ${selfServe.drafts[0].title}`)
}

console.log(
  failures === 0
    ? '\nAll site-phone-audit checks passed.'
    : `\n${failures} site-phone-audit check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
