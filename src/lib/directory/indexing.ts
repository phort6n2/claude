// ============================================
// DIRECTORY — WHICH CITY PAGES ARE WORTH INDEXING
// ============================================
// A city page holding a single shop is a heading, one card, and boilerplate.
// Google's helpful-content systems judge a large set of near-empty templated
// pages against the whole subfolder, so 340 of them don't just fail to rank —
// they weigh on the city pages that could.
//
// So thin city pages stay live, stay linked and stay crawlable, but ask not to
// be indexed until they hold enough to be worth landing on. Nothing is deleted:
// a page flips to indexable on its own the moment a second shop is published
// there, with no migration and no redirect.

/**
 * Shops a city needs before its page is worth indexing.
 *
 * Two, because comparing shops is the job the page exists to do — with one
 * listing it's a detour to that shop's own page. Raising this to 3 would cut
 * the indexed set by roughly a further 60%, which is a bigger bet than the
 * evidence supports today.
 */
export const MIN_SHOPS_TO_INDEX = 2

export function shouldIndexCity(shopCount: number): boolean {
  return shopCount >= MIN_SHOPS_TO_INDEX
}
