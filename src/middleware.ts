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

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (
    pathname !== '/' &&
    !pathname.startsWith('/services/') &&
    !pathname.startsWith('/locations/') &&
    pathname !== '/privacy' &&
    pathname !== '/terms'
  ) {
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
  url.pathname = pathname === '/' ? `/sites/${label}` : `/sites/${label}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/',
    '/services/:path*',
    '/locations/:path*',
    '/privacy',
    '/terms',
  ],
}
