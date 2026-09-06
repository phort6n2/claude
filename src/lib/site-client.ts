/**
 * How a hosted-site route finds its client from the label in the URL.
 *
 * Middleware rewrites `{sub}.glassleads.app/*` and a client's OWN domain to
 * `/sites/{label}/*`, and the label is whichever the request arrived on: the
 * slug, the short subdomain, or the HOSTNAME itself. So every route under
 * /sites/[slug] has to accept all three — and the ones that did not were the
 * ones that broke the moment a client pointed their own domain here.
 *
 * That is not hypothetical either. Before this existed, the favicon, the
 * privacy page, the terms page and the no-JS quote confirmation each carried
 * their own two-way lookup. On a custom domain the favicon quietly fell back
 * to a "?" monogram — no error, just somebody else's mark in the tab — and the
 * other three 404'd, which meant the consent link under the quote form went
 * nowhere and a visitor with no JavaScript posted a lead and landed on a dead
 * page.
 *
 * One builder, so a route cannot resolve its client differently from the page
 * next to it.
 */
export function siteClientWhere(label: string) {
  return {
    OR: [{ slug: label }, { siteSubdomain: label }, { domains: { some: { domain: label } } }],
  }
}
