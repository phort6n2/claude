/**
 * The kinds of page a hosted site publishes, in the order they are shown.
 *
 * A LEAF MODULE, for the reason `google-ads-conversion-setup.ts` and
 * `directory-signal-types.ts` are: `site-sitemap.ts` reaches Prisma, and the
 * admin card that lists these is a client component. Without a leaf the card
 * keeps its own copy of the list — which is exactly what it did.
 *
 * THE COUNT CAME FROM ONE LIST AND THE ROWS FROM ANOTHER. `SitePagesCard`
 * declared the group union, a label map and a render order, all three by hand,
 * against a `SitemapGroup` type it never imported. Adding `insurance` to the
 * sitemap left all three behind, and the failure is the worst shape available:
 * the header counts `entries.length` so it read "12 pages listed", while the
 * rows are rendered per known group so only 11 appeared. Nothing errors,
 * nothing is empty, and the one page somebody had just built is the one
 * missing — on the card whose entire job is answering "is this page in the
 * sitemap".
 *
 * THE UNION IS DERIVED FROM THE ORDERED ARRAY, so they cannot disagree, and
 * the label map is a `Record` over it, so a new group fails to COMPILE until
 * it has a label and a position. No check script can be forgotten because
 * there is no check script — the shapes make the mistake unrepresentable.
 */

export const SITEMAP_GROUPS = ['home', 'service', 'city', 'insurance', 'kept', 'legal'] as const

export type SitemapGroup = (typeof SITEMAP_GROUPS)[number]

export const SITEMAP_GROUP_LABEL: Record<SitemapGroup, string> = {
  home: 'Home',
  service: 'Service pages',
  city: 'City pages',
  insurance: 'Insurance claims',
  kept: 'Pages kept from the old site',
  legal: 'Legal',
}
