import {
  describeFetchFailure,
  fetchHtml,
  validatePublicUrl,
} from '@/lib/site-import'
import { socialLinksFrom, type SocialLinks } from '@/lib/social-links'

/**
 * Read a shop's social profiles off their website, and nothing else.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE IMPORTER. Extraction started life inside
 * `importSiteContent`, which was the right place to put it and the wrong place
 * to leave it, for two reasons that only show up when you ask "can an EXISTING
 * client have theirs pulled":
 *
 * 1. THE FULL IMPORT REWRITES SITE CONTENT. It sets the warranty, the FAQ, the
 *    hero bullets, the story sections and the photos from whatever it finds,
 *    and autosaves. For a client whose content has been curated over weeks,
 *    re-running it to collect two URLs trades the curation for the URLs. Every
 *    client on the platform except a brand new one is in that position, which
 *    made the answer to the question "yes, but do not".
 * 2. IT IS GATED BEHIND A MODEL KEY IT DOES NOT NEED. `importSiteContent`
 *    returns "No Anthropic API key configured" before it fetches anything —
 *    correct for the part that reads prose, absurd for the part that reads
 *    `<a href>`. The most deterministic thing in the importer was the one
 *    thing that could not run without the model.
 *
 * So: one fetch, one parse, no model, and it touches nothing. The home page is
 * enough — a social icon row is site-wide furniture, it lives in the footer,
 * and a second page costs a round trip to find the same links again.
 */
export interface SocialScan {
  ok: boolean
  links: SocialLinks
  /** The address actually fetched, after the guard's https upgrade. */
  url?: string
  error?: string
}

/**
 * A 200 that is not a page — a bot wall's holding stub.
 *
 * FOUND BY RUNNING THIS AGAINST REAL SHOP SITES. One of them answered HTTP
 * **202** with 169 bytes: `<html><head><meta http-equiv="refresh"
 * content="0;/.well-known/sgcaptcha/…">`. `fetchHtml` is right to accept it —
 * it is a 2xx with `text/html` — so the scan found no links in it and said
 * "no social profiles on that page", which is an absence reported as a fact
 * about the shop. That is the same mistake `place-location.ts` records, where
 * Google's REQUEST_DENIED arrived as an HTTP 200 and read as "this business
 * has no coordinates".
 *
 * Two signals, both cheap: a meta refresh pointing at a challenge path, and a
 * body too small to be anybody's home page. Deliberately NOT fixed inside
 * `fetchHtml`: the importer shares it, and widening what that call refuses
 * changes the behaviour of a feature this change is not about.
 */
const CHALLENGE_HINT =
  /sgcaptcha|\/cdn-cgi\/|challenge-platform|__cf_chl|captcha|are you a human|enable javascript and cookies/i

/** Below this, a "home page" is a holding stub. Real ones run 50KB+. */
const MIN_PAGE_BYTES = 1000

export function challengeReason(html: string): string | null {
  const head = html.slice(0, 4000)
  if (/<meta[^>]+http-equiv=["']?refresh/i.test(head) && CHALLENGE_HINT.test(head)) {
    return 'answered with a bot-check redirect instead of the page'
  }
  if (html.trim().length < MIN_PAGE_BYTES) {
    return `answered with only ${html.trim().length} bytes, which is a holding page rather than their site`
  }
  if (CHALLENGE_HINT.test(head) && html.length < 4000) {
    return 'answered with a bot-check page instead of the site'
  }
  return null
}

export async function scanSocialLinks(rawUrl: string): Promise<SocialScan> {
  const check = validatePublicUrl(rawUrl)
  // The URL the GUARD returns, not the one handed in — it upgrades http to
  // https, and a guard you then bypass is not a guard.
  if (!check.ok) return { ok: false, links: {}, error: check.error }

  const result = await fetchHtml(check.url)
  if (!result.ok) {
    return {
      ok: false,
      links: {},
      url: check.url.toString(),
      error: describeFetchFailure(result.failure, check.url.toString()),
    }
  }
  const challenged = challengeReason(result.html)
  if (challenged) {
    return {
      ok: false,
      links: {},
      url: check.url.toString(),
      error: `${check.url.host} ${challenged} — the site is blocking automated visits. Open it in a browser, then read the links off their footer by hand.`,
    }
  }
  return { ok: true, links: socialLinksFrom(result.html, check.url), url: check.url.toString() }
}
