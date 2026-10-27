import type { ContentPatch } from '@/lib/content-patch'

/**
 * AGS Affordable Glass Services — replacement only, everywhere, October 2026.
 * Asked for by the owner: AGS does windshield REPLACEMENT and no resin or chip
 * repair, but its ads buy "windshield repair", because people search that with
 * a crack.
 *
 * THE FLAG. "Windshield repair" had been ticked again to bring
 * /windshield-repair back, and that box is read everywhere as "this shop does
 * resin repair": the page's own sections ("injecting resin", "why sooner is
 * cheaper"), the services lead ("a chip caught early…"), the insurance band,
 * the default FAQ, the city H1s, the home title and the directory listing. So
 * it is unticked here — the FACT — and `repairSearchPage` keeps the PAGE: same
 * address, same nav link, same sitemap entry, crack-and-replacement copy (see
 * REPAIR_SEARCH_PAGE in site-services.ts). The title and H1 ("Windshield
 * Repair in Port Coquitlam") stay: that is what the visitor searched.
 *
 * THE PAGE'S OWN COPY below is the owner's, with three edits:
 * - "lifetime warranty" in the description is "lifetime workmanship
 *   warranty": a named warranty must state its terms (§2), and "workmanship"
 *   is the term — the warranty band on the page spells out the rest.
 * - "ICBC glass coverage usually handles the replacement" says WHEN it does
 *   ("if you carry ICBC glass coverage"): glass is optional coverage in BC,
 *   and this platform is not the insurer.
 * - Written as "we", the rule for every hosted page.
 *
 * THE CITY PAGES (was `ags-2026-10-cities`, never applied, folded in here
 * because it asserted the repair box was off and would now refuse): the
 * rock-chip sentence in each city's road paragraph becomes one about cracks
 * spreading. Every `from` was copied from the LIVE pages on 2026-10-27.
 *
 * NOT touched: the Google reviews (one mentions a rock chip — a customer's
 * words, verbatim), slugs, title and H1, phone, address, email, the ICBC
 * sections, the quote form and "Areas we serve".
 */
export const AGS_2026_10_REPLACEMENT_ONLY: ContentPatch = {
  id: 'ags-2026-10-replacement-only',
  title: 'AGS: replacement only — the windshield-repair page and the city pages',
  client: 'ags',

  clientFields: [
    { field: 'offersRockChipRepair', from: false, to: false },
    { field: 'offersWindshieldRepair', from: true, to: false },
    { field: 'repairSearchPage', from: false, to: true },
  ],

  serviceHeroLines: {
    'windshield-repair':
      'Cracked windshield? We’ll assess it and get it fixed properly — usually with a full replacement, at your home, office or job site.',
  },

  servicePageCopy: {
    'windshield-repair': {
      metaDescription:
        'Cracked windshield in the Tri-Cities? AGS assesses it and replaces it properly — mobile service, ICBC Repair Network, lifetime workmanship warranty.',
      sections: [
        {
          heading: 'When a cracked windshield needs replacing',
          body: 'Cracks longer than a few inches, cracks that reach the edge of the glass, damage in the driver’s line of sight, or more than one crack mean the windshield needs replacing — for your safety, and for the vehicle to pass an inspection. We replace it with OEM-quality glass, and if your vehicle has a camera behind the windshield, we recalibrate it as part of the job.',
        },
        {
          heading: 'Don’t wait on a crack',
          body: 'Cracks spread with temperature swings and road vibration, so a crack that is short today rarely stays that way. A cracked windshield also gives the roof less support and the passenger airbag less to deploy against. If you carry ICBC glass coverage, the replacement normally goes through it — we check your coverage with you and submit the claim to ICBC for you.',
        },
      ],
    },
  },

  // The template's answer to this question offered a repair; with the box
  // unticked it no longer renders, and the shop's own answer takes the slot
  // (and the home page's FAQPage schema, which reads the shop's own FAQ).
  faq: {
    add: [
      {
        q: 'Can my windshield be repaired instead of replaced?',
        a: 'We specialise in windshield replacement rather than repair. Most cracks people call us about need a new windshield anyway — a crack spreads, and once it reaches the edge of the glass or the driver’s line of sight, replacing it is the safe option. Send a photo with your quote and we will tell you honestly what yours needs when we assess it.',
      },
    ],
  },

  cityText: [
    {
      city: 'Coquitlam',
      from: 'That grit, kicked up on David Avenue and Pipeline Road or carried down into Lougheed Highway traffic, is what starts most rock chips.',
      to: 'That grit, kicked up on David Avenue and Pipeline Road or carried down into Lougheed Highway traffic, is hard on a windshield — and once the glass cracks, cold mornings and a hard-run defroster tend to spread the crack until the windshield needs replacing.',
    },
    {
      city: 'Port Coquitlam',
      from: 'Loose stone at highway speed is what makes a rock chip. A cold night up the Burke Mountain slopes in the north end, or a defroster run hard on a wet January morning, is what turns that chip into a crack across the glass.',
      to: 'Loose stone at highway speed is what cracks a windshield. A cold night up the Burke Mountain slopes in the north end, or a defroster run hard on a wet January morning, is what spreads that crack across the glass — and a crack that has spread means a new windshield.',
    },
    {
      city: 'Port Moody',
      from: 'a stone thrown there can leave a chip long before you reach St. Johns Street.',
      to: 'a stone thrown there can crack a windshield long before you reach St. Johns Street, and a crack left alone tends to spread until the glass needs replacing.',
    },
  ],
}
