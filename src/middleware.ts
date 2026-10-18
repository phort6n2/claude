import { NextResponse, type NextRequest } from 'next/server'
// Pure data with no imports of its own, so it is safe in the Edge bundle —
// and it means the flat addresses are defined once rather than in a list here
// and another in site-paths that had to be kept in step by hand.
import { FLAT_SERVICE_PATHS } from '@/lib/site-services'
// Import-free as well, for the same reason.
import {
  MAX_AGE_DAYS,
  SOURCE_COOKIE,
  SOURCE_HEADER,
  decodeTouch,
  encodeTouch,
  mergeTouch,
  numberSourceFor,
} from '@/lib/traffic-source'

/**
 * Host-based routing for hosted client landing pages.
 *
 * `{slug}.glassleads.app` serves that client's landing page: the root path is
 * rewritten to `/sites/{slug}`, which renders from the Client record. All
 * other paths (widget.js, /api/*, assets) pass through untouched, so the
 * subdomain is a fully working origin — the embedded widget loads and posts
 * same-origin, no CORS involved.
 *
 * A client's OWN domain works the same way: the host itself is used as the
 * label, so `collisionautoglass.com/services/x` rewrites to
 * `/sites/collisionautoglass.com/services/x` and the page resolves the client
 * by domain. That keeps the middleware database-free and Edge-safe — it never
 * needs to know which domains exist, because a host that matches no client
 * 404s at the page level exactly as an unknown slug does.
 *
 * The apex, www, localhost, and Vercel preview hosts all fall through to the
 * normal app.
 */

/** Hosts that are the ADMIN app, never a client site. */
function isAppHost(host: string): boolean {
  if (APP_HOSTS.has(host)) return true
  if (host === 'localhost' || host.startsWith('localhost:') || host.startsWith('127.0.0.1')) {
    return true
  }
  // Preview deployments and the project's own vercel.app hosts.
  return host.endsWith('.vercel.app')
}

const APP_HOSTS = new Set(['glassleads.app', 'www.glassleads.app'])

/** The one path every browser asks for whether or not it read the page. */
const FAVICON = '/favicon.ico'

/**
 * Paths that belong to the APP even when requested on a client host.
 *
 * The widget posts leads to /api on whatever origin the page is served from,
 * robots.txt and sitemap.xml are host-aware routes of their own, and widget.js
 * is served at the root. Rewriting any of those into /sites/{slug}/... breaks
 * lead capture on every site at once, so the list is deliberately explicit
 * rather than a clever pattern.
 */
function isAppPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/widget.js' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/o/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/sites/') ||
    // A request for a file is a request for a file.
    /\.[a-z0-9]+$/i.test(pathname)
  )
}


/**
 * The URL shape a shop's ADS already point at.
 *
 * The template puts services under /services/ and locations under
 * /locations/. Every site these replace puts them at the root:
 * /windshield-repair, /auto-glass-repair-portland. At a cutover that
 * difference is not cosmetic — it is every paid destination 404ing the moment
 * DNS moves.
 *
 * So the flat shape is REWRITTEN, not redirected. The ad URL answers 200 with
 * the right page at the address Google already has, which means nothing in
 * the Ads account has to change at changeover: same final URLs, same Quality
 * Score history, same landing-page experience. A redirect would work for a
 * visitor and would still be a hop on a paid click and a changed destination
 * in Google's eyes.
 *
 * Both shapes resolve. /services/x keeps working for anything already linked.
 */
const SERVICE_SLUGS = new Set(FLAT_SERVICE_PATHS)

/** The prefix these sites use for a city page. One constant, one edit. */
const LOCATION_PREFIX = 'auto-glass-repair-'

function flatToTemplatePath(pathname: string): string | null {
  const bare = pathname.replace(/^\/+|\/+$/g, '')
  if (!bare || bare.includes('/')) return null
  // THE REQUESTED WORD IS CARRIED THROUGH, not swapped for the service's own
  // slug. An alias used to be rewritten to /services/windshield-replacement,
  // so the page had no way of knowing it had been asked for as "auto glass
  // replacement" and headed itself "Windshield Replacement" — telling a
  // visitor who clicked an ad for the first thing that they had landed on the
  // second. The route resolves the alias itself (getServicePage) and names
  // the page after the address (serviceHeading); the canonical still points
  // at the template path, so only one of the two is indexed.
  if (SERVICE_SLUGS.has(bare)) return `/services/${bare}`
  // LOCATION PATHS ARE NOT MAPPED HERE, and the reason is a regression this
  // caused: /auto-glass-repair-hillsboro is one of Collision's KEPT PAGES, and
  // rewriting it to /locations/hillsboro — a city with no page — turned a
  // working 200 into a 404. Middleware cannot know which paths a shop has
  // kept without a database it has no business touching, and a kept page must
  // always win: it is the more specific, more recent decision.
  //
  // Services are safe to map here because their slugs are a fixed list that
  // the capture flow never produces. Flat CITY urls belong in the catch-all
  // route, which already resolves kept pages first and can see the client's
  // real location list. See OPEN-ITEMS.
  void LOCATION_PREFIX
  return null
}

/**
 * WHERE THIS VISITOR CAME FROM, decided before the page renders.
 *
 * The page picks its phone number from it (a Microsoft or Meta visitor sees
 * that platform's tracking number, everyone else the default one), so it has
 * to be known on the FIRST request, when the click id is on the URL and no
 * cookie exists yet. Doing it here rather than in a script after load means
 * the right number is in the HTML: no flash of the wrong one, and Google's own
 * call swap — which reads the page once after load — sees exactly what it saw
 * before for every Google visitor.
 *
 * The page is told through a request header that is always overwritten, so
 * nothing outside can choose a number by sending one. The cookie is written
 * only when the remembered touch changes, not on every page view.
 */
function withTrafficSource(req: NextRequest, respond: (headers: Headers) => NextResponse): NextResponse {
  const hostHeader = req.headers.get('host') || req.nextUrl.host
  // Built from the Host header, not req.nextUrl: the comparison that tells
  // internal navigation from a real referrer needs the public host, and a
  // clicked-around visitor must not be re-labelled "referral" by their own
  // previous page.
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(':', '')
  const landingUrl = `${proto}://${hostHeader}${req.nextUrl.pathname}${req.nextUrl.search}`
  const prev = decodeTouch(req.cookies.get(SOURCE_COOKIE)?.value)
  const { touch, changed } = mergeTouch(prev, {
    url: landingUrl,
    referrer: req.headers.get('referer'),
    now: Date.now(),
  })
  const headers = new Headers(req.headers)
  const numberSource = numberSourceFor(touch)
  if (numberSource) headers.set(SOURCE_HEADER, numberSource)
  else headers.delete(SOURCE_HEADER)
  const res = respond(headers)
  if (changed) {
    res.cookies.set(SOURCE_COOKIE, encodeTouch(touch), {
      path: '/',
      maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
      sameSite: 'lax',
      secure: proto === 'https',
      // The widget reads it as a fallback for its own storage.
      httpOnly: false,
    })
  }
  return res
}

/** A page a person reads, as opposed to a file, an API call or the admin. */
function isPagePath(pathname: string): boolean {
  return !/\.[a-z0-9]+$/i.test(pathname)
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  // /favicon.ico is checked below, BEFORE isAppPath — it ends in an extension,
  // so the "a request for a file is a request for a file" rule would hand a
  // client host the platform's own icon route, which has nothing there.
  if (pathname !== FAVICON && isAppPath(pathname)) {
    // /sites/{slug} on the app host is the PREVIEW form of a client page —
    // what a Vercel preview deployment and the admin's own preview links
    // serve. It gets the same source handling, so per-source numbers can be
    // tested before a domain ever points at a deployment.
    if (pathname.startsWith('/sites/') && isPagePath(pathname)) {
      return withTrafficSource(req, (headers) => NextResponse.next({ request: { headers } }))
    }
    return NextResponse.next()
  }

  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  if (isAppHost(host)) return NextResponse.next()

  let label: string
  if (host.endsWith('.glassleads.app')) {
    const subdomain = host.slice(0, -'.glassleads.app'.length)
    if (!subdomain || subdomain === 'www' || subdomain.includes('.')) return NextResponse.next()
    label = subdomain
  } else {
    // A client's own domain. The host IS the label; getClient() matches it
    // against ClientDomain.
    label = host
  }

  const url = req.nextUrl.clone()
  // THE ROOT FAVICON, which plenty of things ask for without reading the page
  // first: a browser restoring a tab from history or a bookmark, and every
  // scraper and favicon service that only ever tries /favicon.ico. The pages
  // carry a <link rel="icon"> at the client's own icon route, so a browser
  // that loads the page is already right — this is for everything that does
  // not, and it 404'd on every client host until now.
  if (pathname === FAVICON) {
    url.pathname = `/sites/${label}/icon`
    return NextResponse.rewrite(url)
  }
  // A flat ad URL maps onto the template route BEFORE the /sites/ rewrite, so
  // both end up at the same handler and only the address differs.
  const mapped = flatToTemplatePath(pathname)
  const target = mapped || pathname
  url.pathname = target === '/' ? `/sites/${label}` : `/sites/${label}${target}`
  return withTrafficSource(req, (headers) => NextResponse.rewrite(url, { request: { headers } }))
}

/**
 * EVERYTHING on a client host now, not a fixed list of page types.
 *
 * A shop replacing an old site keeps some of its addresses — a page they kept
 * at its original path, or a 301 for one they did not. Those paths are
 * arbitrary and stored per client, so the middleware cannot enumerate them; it
 * has to hand anything unrecognised to the catch-all route, which looks them
 * up and 404s if there is nothing there.
 *
 * The app host short-circuits on the very first check inside, so the admin and
 * portal are untouched by the wider matcher.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
