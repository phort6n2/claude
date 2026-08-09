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
 * Only `*.glassleads.app` subdomains are treated as client sites. The apex,
 * www, localhost, and Vercel preview hosts all fall through to the normal app.
 * A slug that doesn't exist 404s at the page level, not here — the middleware
 * stays database-free and Edge-safe.
 */

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
  if (!host.endsWith('.glassleads.app') || APP_HOSTS.has(host)) {
    return NextResponse.next()
  }

  const slug = host.slice(0, -'.glassleads.app'.length)
  if (!slug || slug === 'www' || slug.includes('.')) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = pathname === '/' ? `/sites/${slug}` : `/sites/${slug}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/', '/services/:path*', '/locations/:path*', '/privacy', '/terms'],
}
