/**
 * Which links off a shop's own website are their social ACCOUNTS.
 *
 * Run: npx tsx scripts/check-social-links.ts
 *
 * BOTH DIRECTIONS, and the eager one is the expensive direction. These links
 * are published on a public directory listing, so a false positive is a wrong
 * fact about a business on somebody else's page — and the false positive is
 * not exotic, it is the single most common Facebook link in any footer: the
 * "share this page" button. `facebook.com/sharer/sharer.php?u=…` matches
 * `href*="facebook.com"` perfectly, and a listing that links to it sends
 * whoever clicks into a share dialog for the shop's own home page.
 *
 * Too strict costs the feature: a real profile refused means an operator
 * pastes it by hand, or gives up and the listing has none. So every shape a
 * real profile actually takes is held here too — Facebook's `/pages/Name/123`
 * and `profile.php?id=`, YouTube's four channel spellings, an Instagram
 * handle with a dot in it.
 *
 * The trap list is the valuable half of this file.
 */

import {
  countSocialLinks,
  mergeSocialLinks,
  normalizeSocialUrl,
  platformFor,
  readSocialLinks,
  socialLinkProblem,
  socialLinksFrom,
} from '../src/lib/social-links'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

/** A URL that must be accepted as this shop's account. */
function expectAccount(url: string, platform: string) {
  const problem = socialLinkProblem(url)
  if (problem) return fail(`REFUSED a real profile: ${url} — “${problem}”`)
  const found = platformFor(url)
  if (found !== platform) return fail(`${url} read as ${found}, expected ${platform}`)
  pass(`${platform}: ${url}`)
}

/** A URL that must NOT be published as an account. */
function expectRefused(url: string, why: string) {
  const problem = socialLinkProblem(url)
  if (!problem) return fail(`ACCEPTED ${why}: ${url}`)
  pass(`refused (${why}): ${problem}`)
}

// --- The share buttons, which is why this module exists ---------------------

console.log('\nShare buttons and widgets — the false positive that matters')
{
  expectRefused(
    'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexampleglass.com%2F',
    'Facebook share dialog'
  )
  expectRefused(
    'https://www.facebook.com/share.php?u=https://exampleglass.com/',
    'Facebook share.php'
  )
  expectRefused(
    'https://www.facebook.com/dialog/share?app_id=1&href=https://exampleglass.com',
    'Facebook share dialog (app)'
  )
  expectRefused('https://www.facebook.com/plugins/like.php?href=x', 'Facebook like plugin')
  // The tracking pixel. Not a link a human clicks, and it is in the markup of
  // a very large number of small-business sites.
  expectRefused('https://www.facebook.com/tr?id=123&ev=PageView', 'Facebook tracking pixel')
  expectRefused('https://twitter.com/intent/tweet?url=https://exampleglass.com', 'tweet intent')
  expectRefused('https://x.com/intent/post?url=https://exampleglass.com', 'X post intent')
  expectRefused(
    'https://www.pinterest.com/pin/create/button/?url=https://exampleglass.com',
    'Pinterest save button'
  )
  expectRefused(
    'https://www.linkedin.com/shareArticle?mini=true&url=https://exampleglass.com',
    'LinkedIn share'
  )
  expectRefused(
    'https://www.linkedin.com/sharing/share-offsite/?url=https://exampleglass.com',
    'LinkedIn share-offsite'
  )
}

console.log('\nNot an account: platform furniture and single pieces of content')
{
  expectRefused('https://www.facebook.com/', 'Facebook home page')
  expectRefused('https://www.facebook.com', 'Facebook home page, no path')
  expectRefused('https://www.instagram.com/', 'Instagram home page')
  expectRefused('https://www.instagram.com/p/CxYz123/', 'one Instagram post')
  expectRefused('https://www.instagram.com/reel/CxYz123/', 'one Instagram reel')
  expectRefused('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'one YouTube video')
  expectRefused('https://youtu.be/dQw4w9WgXcQ', 'a YouTube share link')
  expectRefused('https://www.tiktok.com/video/123', 'one TikTok video')
  expectRefused('https://www.facebook.com/groups/orlandoautoglass', 'a Facebook group')
  expectRefused('https://www.facebook.com/login/', 'a login page')
  expectRefused('https://www.linkedin.com/feed/', 'the LinkedIn feed')
  expectRefused('http://example.com/about', 'not a social network at all')
  expectRefused('mailto:owner@exampleglass.com', 'a mailto')
  expectRefused('/follow-us', 'a relative path')
}

// --- The profiles a real shop actually has ---------------------------------

console.log('\nReal accounts, in the shapes they really take')
{
  expectAccount('https://www.facebook.com/MAGMobileAutoGlass', 'facebook')
  // Facebook's older page URL and its numeric permalink. A query string is
  // not automatically noise.
  expectAccount('https://www.facebook.com/pages/MAG-Mobile-Auto-Glass/123456789', 'facebook')
  expectAccount('https://www.facebook.com/profile.php?id=61550000000000', 'facebook')
  expectAccount('https://www.facebook.com/people/MAG-Mobile/100090000000000/', 'facebook')
  expectAccount('https://www.instagram.com/mag.mobile.autoglass/', 'instagram')
  expectAccount('https://twitter.com/magautoglass', 'x')
  expectAccount('https://x.com/magautoglass', 'x')
  // All four YouTube channel spellings are in the wild.
  expectAccount('https://www.youtube.com/@MAGMobileAutoGlass', 'youtube')
  expectAccount('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', 'youtube')
  expectAccount('https://www.youtube.com/c/MAGMobileAutoGlass', 'youtube')
  expectAccount('https://www.youtube.com/user/magautoglass', 'youtube')
  expectAccount('https://www.tiktok.com/@magautoglass', 'tiktok')
  expectAccount('https://www.linkedin.com/company/mag-mobile-auto-glass', 'linkedin')
  expectAccount('https://www.linkedin.com/in/magowner', 'linkedin')
  expectAccount('https://www.pinterest.com/magautoglass', 'pinterest')
  expectAccount('https://www.pinterest.co.uk/magautoglass', 'pinterest')
}

// --- Normalising -----------------------------------------------------------

console.log('\nOne canonical form per account')
{
  const cases: Array<[string, string, string]> = [
    [
      'tracking params dropped',
      'https://www.facebook.com/MAGGlass?fbclid=abc&utm_source=footer',
      'https://www.facebook.com/MAGGlass',
    ],
    [
      'instagram share id dropped',
      'https://www.instagram.com/magglass/?igshid=xyz',
      'https://www.instagram.com/magglass',
    ],
    ['http upgraded', 'http://www.facebook.com/MAGGlass', 'https://www.facebook.com/MAGGlass'],
    [
      'mobile facebook host normalised',
      'https://m.facebook.com/MAGGlass',
      'https://www.facebook.com/MAGGlass',
    ],
    ['fragment dropped', 'https://x.com/magglass#top', 'https://x.com/magglass'],
    [
      'the profile.php id is NOT a tracking param',
      'https://www.facebook.com/profile.php?id=6155&fbclid=zz',
      'https://www.facebook.com/profile.php?id=6155',
    ],
  ]
  for (const [label, input, want] of cases) {
    const got = normalizeSocialUrl(input)
    if (got === want) pass(`${label}: ${got}`)
    else fail(`${label}\n      got:  ${got}\n      want: ${want}`)
  }
  // A handle's capitalisation belongs to whoever chose it.
  if (normalizeSocialUrl('https://www.facebook.com/MAGGlass') === 'https://www.facebook.com/MAGGlass')
    pass('the path case is left alone')
  else fail('the path was lower-cased — that is somebody else’s handle')
}

// --- Reading a real footer -------------------------------------------------

console.log('\nA footer, as they actually come')
{
  // The shape of every one of these sites: an icon row where the share
  // buttons sit beside the real accounts.
  const footer = `
    <footer>
      <a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmag.com" class="share">Share</a>
      <a href="https://twitter.com/intent/tweet?url=https%3A%2F%2Fmag.com">Tweet</a>
      <ul class="social">
        <li><a href="https://www.facebook.com/MAGMobileAutoGlass"><i class="fa-facebook"></i></a></li>
        <li><a href="/instagram" onclick="x">bad</a></li>
        <li><a href='https://www.instagram.com/magmobileautoglass/'><i class="fa-instagram"></i></a></li>
        <li><a href=https://www.youtube.com/@MAGMobile>YouTube</a></li>
      </ul>
      <a href="https://www.facebook.com/MAGMobileAutoGlass/reviews">Reviews</a>
    </footer>`
  const found = socialLinksFrom(footer, new URL('https://magmobileautoglass.com/'))
  if (found.facebook === 'https://www.facebook.com/MAGMobileAutoGlass')
    pass(`facebook: ${found.facebook}`)
  else fail(`facebook came out as ${found.facebook}`)
  if (found.instagram === 'https://www.instagram.com/magmobileautoglass')
    pass(`instagram: ${found.instagram}`)
  else fail(`instagram came out as ${found.instagram}`)
  if (found.youtube === 'https://www.youtube.com/@MAGMobile') pass(`youtube: ${found.youtube}`)
  else fail(`youtube came out as ${found.youtube}`)
  if (found.x) fail(`the tweet intent was published as their X account: ${found.x}`)
  else pass('no X account — the only X link was a tweet intent')
  if (countSocialLinks(found) !== 3) fail(`expected 3 profiles, got ${countSocialLinks(found)}`)
  else pass('three profiles from a footer holding five social links')

  /* JSON-LD sameAs IS READ FIRST, for the reason the content feed prefers an
     advertised <link rel="alternate"> and the logo scorer prefers the JSON-LD
     logo: a declaration beats anything inferred from markup. Here the footer
     icon points at a franchise page and the declaration at the shop's own. */
  const declared = `
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"AutoRepair","name":"MAG",
     "sameAs":["https://www.facebook.com/TheRealMAG","https://www.yelp.com/biz/mag"]}
    </script>
    <footer><a href="https://www.facebook.com/SomeFranchiseNetwork">Facebook</a></footer>`
  const fromLd = socialLinksFrom(declared, new URL('https://magmobileautoglass.com/'))
  if (fromLd.facebook === 'https://www.facebook.com/TheRealMAG')
    pass('the declared sameAs profile wins over the footer icon')
  else fail(`sameAs did not win: ${fromLd.facebook}`)
  // Yelp is not in the set: the directory field takes the seven platforms a
  // Google Business Profile itself supports, and inventing an eighth key the
  // directory does not read would be silently dropped.
  if (Object.values(fromLd).includes('https://www.yelp.com/biz/mag'))
    fail('Yelp was stored as a social platform')
  else pass('a non-platform sameAs entry is ignored')

  // A site with nothing is a normal site, not a failure.
  const bare = socialLinksFrom(
    '<footer><a href="/contact">Contact</a><a href="tel:4077803837">Call</a></footer>',
    new URL('https://magmobileautoglass.com/')
  )
  if (countSocialLinks(bare) === 0) pass('a footer with no socials yields none')
  else fail('invented a profile from a footer that had none')

  /* A LINK ON THE PAGE'S OWN HOST IS NEVER A PROFILE. Relative hrefs resolve
     against the page, so a careless base host used to produce an "account"
     from `/contact` — this pins the guard rather than the careless base. */
  const sameHost = socialLinksFrom(
    '<footer><a href="/contact">Contact</a></footer>',
    new URL('https://x.com/')
  )
  if (countSocialLinks(sameHost) === 0) pass('a same-host relative link is not an account')
  else fail(`read a page on its own host as an account: ${JSON.stringify(sameHost)}`)
}

console.log('\nMerging several crawled pages')
{
  const home = { facebook: 'https://www.facebook.com/Home' }
  const contact = {
    facebook: 'https://www.facebook.com/Different',
    instagram: 'https://www.instagram.com/shop',
  }
  const merged = mergeSocialLinks(home, contact)
  if (merged.facebook === 'https://www.facebook.com/Home')
    pass('the home page wins where both pages have one')
  else fail(`the contact page overwrote the home page: ${merged.facebook}`)
  if (merged.instagram === 'https://www.instagram.com/shop')
    pass('a platform only the contact page had is kept')
  else fail('lost a profile that only the second page carried')
}

// --- Reading the stored column back ----------------------------------------

console.log('\nWhat comes back out of the database')
{
  /* RE-SCREENED ON READ, not merely type-checked. A row written before a rule
     existed — or pasted into an earlier version of the card — must not reach a
     public directory page because it is already stored. */
  const stored = {
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=https://mag.com',
    instagram: 'https://www.instagram.com/magglass',
    x: '',
    youtube: 42,
    nonsense: 'https://www.facebook.com/Whatever',
  }
  const read = readSocialLinks(stored)
  if (read.facebook) fail('a stored share-button URL survived the read')
  else pass('a stored share-button URL is dropped on read')
  if (read.instagram === 'https://www.instagram.com/magglass')
    pass('the good one beside it is kept')
  else fail('a bad entry cost the good ones')
  if ('x' in read || 'youtube' in read) fail('an empty or non-string value was kept')
  else pass('empty and non-string values are dropped')
  if (Object.keys(read).length !== 1) fail(`expected 1 link, got ${Object.keys(read).length}`)
  else pass('an unknown key is not a platform')

  for (const junk of [null, undefined, 'a string', 42, ['https://facebook.com/x']]) {
    if (countSocialLinks(readSocialLinks(junk)) === 0) continue
    fail(`readSocialLinks invented links from ${JSON.stringify(junk)}`)
  }
  pass('a null, a string, a number and an array all read as none')
}

console.log(
  failures === 0
    ? '\nAll social-link checks passed.'
    : `\n${failures} social-link check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
