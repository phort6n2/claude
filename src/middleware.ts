import { NextResponse, type NextRequest } from 'next/server'

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
const SERVICE_SLUGS = new Set([
  'windshield-replacement',
  'windshield-repair',
  'rock-chip-repair',
  'side-window-replacement',
  'back-glass-replacement',
  'sunroof-repair',
  'adas-calibration',
])

/** The prefix these sites use for a city page. One constant, one edit. */
const LOCATION_PREFIX = 'auto-glass-repair-'

function flatToTemplatePath(pathname: string): string | null {
  const bare = pathname.replace(/^\/+|\/+$/g, '')
  if (!bare || bare.includes('/')) return null
  if (SERVICE_SLUGS.has(bare)) return `/services/${bare}`
  if (bare.startsWith(LOCATION_PREFIX)) {
    const city = bare.slice(LOCATION_PREFIX.length)
    // A city this shop does not serve simply 404s on the location route,
    // which is the same answer it would have given before.
    if (city) return `/locations/${city}`
  }
  return null
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isAppPath(pathname)) return NextResponse.next()

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
  // A flat ad URL maps onto the template route BEFORE the /sites/ rewrite, so
  // both end up at the same handler and only the address differs.
  const mapped = flatToTemplatePath(pathname)
  const target = mapped || pathname
  url.pathname = target === '/' ? `/sites/${label}` : `/sites/${label}${target}`
  return NextResponse.rewrite(url)
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
