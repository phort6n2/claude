import type { ContentPatch } from '@/lib/content-patch'

/**
 * AGS Affordable Glass Services — the three city pages its ads point at
 * (/auto-glass-repair-coquitlam, -port-coquitlam, -port-moody), October 2026.
 * Asked for by the owner: AGS does windshield REPLACEMENT only.
 *
 * The H1, the lead-in under it and the meta description are template copy and
 * now follow the service flags (`city-page-copy.ts`), so they need nothing
 * here beyond the two flags being off — asserted, so a re-tick since the last
 * patch is caught before the copy below goes live beside a "repair" headline.
 *
 * What this replaces is the road paragraph in each city's own copy, which
 * ended on rock chips: `ags-2026-10` kept those lines on the reasoning that
 * they describe the road, not a service — but on a replacement-only shop's
 * page, a paragraph about how chips start reads as an offer to fix them. Each
 * now says what the same road does to a windshield and that a spreading crack
 * means a new one. Nothing about timing, price or what the shop does that is
 * not already on the page. The streets are the owner's own.
 *
 * NOT touched: the Google reviews (one mentions a rock chip — it is a
 * customer's words, verbatim, and stays), the slugs, the phone, the address,
 * the ICBC content, the quote form and "Areas we serve".
 *
 * Every `from` was copied from the LIVE pages on 2026-10-27.
 */
export const AGS_2026_10_CITIES: ContentPatch = {
  id: 'ags-2026-10-cities',
  title: 'AGS: city pages — windshield replacement only',
  client: 'ags',

  clientFields: [
    { field: 'offersRockChipRepair', from: false, to: false },
    { field: 'offersWindshieldRepair', from: false, to: false },
  ],

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
