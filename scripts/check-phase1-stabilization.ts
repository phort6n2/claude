import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { withDefaultFaq } from '../src/lib/site-faq'
import { googleListingHref, InsuranceBand } from '../src/components/sites/shared'

const replacementOnlyFaq = withDefaultFaq([], {
  state: 'FL',
  offersWindshieldRepair: false,
  offersAdasCalibration: true,
})
assert.equal(
  replacementOnlyFaq.some((item) => /repaired instead/i.test(item.q)),
  false,
  'replacement-only clients must not advertise windshield repair in the default FAQ'
)

const nonFilingInsurance = renderToStaticMarkup(
  React.createElement(InsuranceBand, {
    state: 'FL',
    filesClaims: false,
    affiliation: 'Independent shop.',
  })
)
assert.doesNotMatch(
  nonFilingInsurance,
  /we do the paperwork/i,
  'clients that do not file claims must not say they do the paperwork'
)
assert.match(nonFilingInsurance, /help you confirm what yours covers/i)

const filingInsurance = renderToStaticMarkup(
  React.createElement(InsuranceBand, {
    state: 'FL',
    filesClaims: true,
    affiliation: 'Independent shop.',
  })
)
assert.match(filingInsurance, /we do the paperwork/i)

assert.equal(
  googleListingHref('https://g.page/r/example/review'),
  'https://g.page/r/example',
  'review-writing links must become public-listing links'
)
assert.equal(
  googleListingHref('https://www.google.com/maps/place/example'),
  'https://www.google.com/maps/place/example',
  'normal Maps links must remain unchanged'
)

const widgetSource = readFileSync('src/app/widget.js/route.ts', 'utf8')
assert.doesNotMatch(widgetSource, /Four quick questions/)
assert.doesNotMatch(widgetSource, /\(714\) 555-0142/)
assert.doesNotMatch(widgetSource, /placeholder: '92614'/)
assert.match(widgetSource, /anything that helps us quote/)

console.log('Phase 1 stabilization checks passed.')
