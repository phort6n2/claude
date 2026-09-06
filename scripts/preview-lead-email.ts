/**
 * Render a lead alert to a file so somebody can LOOK at it.
 *
 *   npx tsx scripts/preview-lead-email.ts [out.html]
 *
 * There was no way to see this email except by sending a real alert to a real
 * inbox — which is how it ran for a long time with its details table
 * rendering at roughly half size on a phone, the only device any of these are
 * read on. The landing-page value carried the full ad URL (gclid, gbraid,
 * campaignid), a couple of hundred characters with nowhere to break, so iOS
 * Mail sized the table to that string and scaled it down to fit the screen.
 *
 * The lead below is the WORST case on purpose: every optional field present,
 * a real ad URL, a long note. If it reads on a phone, a real one will.
 */
import { writeFileSync } from 'node:fs'
import { emailHtml } from '@/lib/lead-notifications'

const out = process.argv[2] || '/tmp/lead-email.html'

/* The same lead twice, because the alert has TWO origin badges and only one
   of them can ever render. The paid one is a claim about ad spend; the other
   reports the shop's own link tagging — a Business Profile, Yelp, a social
   post. Rendering only the paid case is how the second one would have gone
   unlooked-at until it appeared on a live lead. */
const base = {
  name: 'William Alvarez',
  phone: '+17143102784',
  email: 'william.alvarez@example.com',
  service: 'Windshield Repair',
  vehicle: 'Mercedes Benz 2013 E 350 convertible',
  postalCode: '92646',
  message:
    'Crack starts at the bottom passenger side and runs about eight inches up. Happened on the 405 this morning.',
  source: 'Landing page',
  leadUrl: 'https://glassleads.app/admin/leads/abc123',
  outcomeUrl: 'https://glassleads.app/o/signed-token',
  vin: '4JGDA5HB4JB123456',
  insurance: 'Not sure yet about insurance',
  carrier: '',
  // The real shape of one, straight off a live alert.
  landingPage:
    'https://autoglassking.com/auto-glass-repair?gc_id=23874534588&g_special_campaign=true&gad_source=1&gad_campaignid=23355809702&gbraid=0AAAAA0tjR5mGv57JFPnlO3hacvvrfUvoTq&gclid=EAIaIQobChMIwZvomJLWlgMVLChECB21qzATEAAYBCAAEgIb-_D_BwE',
  damagePhotoUrl: '',
  isCall: false,
}

const paid = emailHtml('Auto Glass Kings', {
  ...base,
  attribution: {
    gclid: 'EAIaIQobChMIwZvomJLWlgMVLChECB21qzATEAAYBCAAEgIb-_D_BwE',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'AGMP Lead Gen',
  },
})

// A real tagged link off the same client's list: one per Business Profile.
const tagged = emailHtml('Auto Glass Kings', {
  ...base,
  landingPage: 'https://autoglasskings.com/quote/?utm_source=gbp_aliso_viejo',
  attribution: { utmSource: 'gbp_aliso_viejo', utmMedium: 'organic' },
})

const taggedOut = out.replace(/(\.html)?$/, '-tagged.html')
writeFileSync(out, paid)
writeFileSync(taggedOut, tagged)
console.log(`Wrote ${out} (${paid.length} bytes) — Google Ads badge.`)
console.log(`Wrote ${taggedOut} (${tagged.length} bytes) — tagged-link badge.`)
console.log('Screenshot them at phone width to check the type size:')
console.log(`  node scripts/shot-lead-email.mjs ${out}`)
