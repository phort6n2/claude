// ============================================
// DIRECTORY — WHICH CITY PAGES ARE WORTH INDEXING
// ============================================
// A city page holding a single shop is a heading, one card, and boilerplate.
// Google's helpful-content systems judge a large set of near-empty templated
// pages against the whole subfolder, so hundreds of them don't just fail to
// rank — they weigh on the city pages that could.
//
// So thin city pages stay live, stay linked and stay crawlable, but ask not to
// be indexed until they hold enough to be worth landing on. Nothing is deleted:
// a page flips to indexable on its own the moment a second shop is published
// there, with no migration and no redirect.
//
// Major metros are the exception — see MAJOR_METROS below.

/**
 * Shops a city needs before its page is worth indexing.
 *
 * Two, because comparing shops is the job the page exists to do — with one
 * listing it's a detour to that shop's own page.
 */
export const MIN_SHOPS_TO_INDEX = 2

/**
 * Cities that stay indexable regardless of how many shops we currently list.
 *
 * A shop-count threshold alone conflates two different things: a page that is
 * thin because the market is tiny, and a page that is thin because OUR coverage
 * of a large market is incomplete. Suppressing "auto glass in Atlanta" is not
 * quality control, it's forfeiting the query — the demand is real whether or
 * not we've finished sourcing, and these pages should be accruing history while
 * we fill them in.
 *
 * Keyed "city|state" (lowercase) because city names repeat across states:
 * Columbus OH and Columbus GA, Portland OR and Portland ME, Glendale AZ and
 * Glendale CA are different places with different pages.
 */
const MAJOR_METROS = new Set([
  'new york|ny', 'los angeles|ca', 'chicago|il', 'houston|tx', 'phoenix|az',
  'philadelphia|pa', 'san antonio|tx', 'san diego|ca', 'dallas|tx', 'austin|tx',
  'jacksonville|fl', 'fort worth|tx', 'san jose|ca', 'columbus|oh',
  'charlotte|nc', 'indianapolis|in', 'san francisco|ca', 'seattle|wa',
  'denver|co', 'oklahoma city|ok', 'nashville|tn', 'washington|dc',
  'el paso|tx', 'las vegas|nv', 'boston|ma', 'detroit|mi', 'portland|or',
  'louisville|ky', 'memphis|tn', 'baltimore|md', 'milwaukee|wi',
  'albuquerque|nm', 'tucson|az', 'fresno|ca', 'sacramento|ca', 'mesa|az',
  'atlanta|ga', 'kansas city|mo', 'colorado springs|co', 'omaha|ne',
  'raleigh|nc', 'miami|fl', 'virginia beach|va', 'long beach|ca',
  'oakland|ca', 'minneapolis|mn', 'saint paul|mn', 'st. paul|mn', 'tulsa|ok',
  'bakersfield|ca', 'wichita|ks', 'arlington|tx', 'aurora|co', 'tampa|fl',
  'new orleans|la', 'cleveland|oh', 'anaheim|ca', 'honolulu|hi',
  'riverside|ca', 'corpus christi|tx', 'lexington|ky', 'henderson|nv',
  'stockton|ca', 'cincinnati|oh', 'pittsburgh|pa', 'greensboro|nc',
  'anchorage|ak', 'plano|tx', 'lincoln|ne', 'orlando|fl', 'irvine|ca',
  'newark|nj', 'toledo|oh', 'durham|nc', 'chula vista|ca', 'fort wayne|in',
  'jersey city|nj', 'st. petersburg|fl', 'saint petersburg|fl', 'laredo|tx',
  'madison|wi', 'chandler|az', 'buffalo|ny', 'lubbock|tx', 'scottsdale|az',
  'reno|nv', 'glendale|az', 'gilbert|az', 'winston-salem|nc',
  'north las vegas|nv', 'norfolk|va', 'chesapeake|va', 'garland|tx',
  'irving|tx', 'hialeah|fl', 'fremont|ca', 'boise|id', 'richmond|va',
  'baton rouge|la', 'spokane|wa', 'des moines|ia', 'tacoma|wa',
  'san bernardino|ca', 'modesto|ca', 'fontana|ca', 'santa clarita|ca',
  'birmingham|al', 'oxnard|ca', 'fayetteville|nc', 'rochester|ny',
  'moreno valley|ca', 'little rock|ar', 'huntington beach|ca',
  'grand rapids|mi', 'salt lake city|ut', 'tallahassee|fl', 'worcester|ma',
  'newport news|va', 'huntsville|al', 'knoxville|tn', 'providence|ri',
  'santa ana|ca', 'overland park|ks', 'grand prairie|tx', 'brownsville|tx',
  'jackson|ms', 'sioux falls|sd', 'vancouver|wa', 'chattanooga|tn',
  'fort lauderdale|fl', 'salem|or', 'eugene|or', 'springfield|mo',
  'peoria|az', 'pembroke pines|fl', 'elk grove|ca', 'corona|ca',
  'lancaster|ca', 'palmdale|ca', 'salinas|ca', 'hayward|ca', 'sunnyvale|ca',
  'pomona|ca', 'escondido|ca', 'naperville|il', 'bellevue|wa', 'joliet|il',
  'murfreesboro|tn', 'rockford|il', 'savannah|ga', 'paterson|nj',
  'torrance|ca', 'bridgeport|ct', 'mcallen|tx', 'syracuse|ny', 'surprise|az',
  'denton|tx', 'roseville|ca', 'thornton|co', 'miramar|fl', 'pasadena|tx',
  'mesquite|tx', 'olathe|ks', 'dayton|oh', 'akron|oh', 'shreveport|la',
  'augusta|ga', 'mobile|al', 'columbus|ga', 'montgomery|al', 'aurora|il',
  'yonkers|ny', 'amarillo|tx', 'glendale|ca', 'tempe|az',
  'cape coral|fl', 'sioux city|ia', 'clarksville|tn',
])

export function isMajorMetro(city: string, state: string): boolean {
  return MAJOR_METROS.has(`${city.trim().toLowerCase()}|${state.trim().toLowerCase()}`)
}

export function shouldIndexCity(
  shopCount: number,
  city?: string,
  state?: string
): boolean {
  if (city && state && isMajorMetro(city, state)) return true
  return shopCount >= MIN_SHOPS_TO_INDEX
}
