import type { ContentPatch } from '@/lib/content-patch'

/**
 * AGS Affordable Glass Services — the ICBC claim page (/icbc-glass-claims),
 * October 2026. Asked for by the owner: AGS replaces only.
 *
 * The subhead ("Chipped or cracked glass and going through ICBC?") and the
 * "can usually still be repaired" line under "What to have ready" are template
 * copy and now follow the repair flags (`ProgramCopyContext.repair`), so they
 * need nothing here. What is AGS's own is one photo: imported from their old
 * site with the caption "Cracked windshield with a rock chip and spreading
 * cracks", which the claim page prints under the image and as its alt. The
 * photo stays; only the words about a chip go.
 *
 * The `from` was copied from the LIVE page on 2026-10-28.
 */
export const AGS_2026_10_ICBC: ContentPatch = {
  id: 'ags-2026-10-icbc',
  title: 'AGS: ICBC page photo caption — no rock chip',
  client: 'ags',

  // Asserted, so the template copy above is the replacement-only version.
  clientFields: [
    { field: 'offersWindshieldRepair', from: false, to: false },
    { field: 'offersRockChipRepair', from: false, to: false },
  ],

  photos: {
    renameAlt: [
      {
        from: 'Cracked windshield with a rock chip and spreading cracks',
        to: 'Cracked windshield with spreading cracks',
      },
    ],
  },
}
