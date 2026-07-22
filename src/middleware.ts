import { NextResponse, type NextRequest } from 'next/server'
import {
  CONTENT_ENABLED,
  isContentApiPath,
  isContentPagePath,
} from '@/lib/features'

// Hostnames that should serve the PUBLIC auto glass directory at their root.
// Set DIRECTORY_HOST to your directory domain(s), comma-separated, e.g.
//   DIRECTORY_HOST="windshieldrepairhq.com,www.windshieldrepairhq.com"
// Attach the same domain in Vercel and the directory shows at the root — no
// code change needed. Leave unset and everything behaves as before.
const DIRECTORY_HOSTS = (process.env.DIRECTORY_HOST || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

function requestHost(req: NextRequest): string {
  return (req.headers.get('host') || '').split(':')[0].toLowerCase()
}

/**
 * When a request arrives on the directory domain, keep that domain scoped to
 * the public directory: serve the directory home at "/", let /directory and
 * the directory API through, and keep internal surfaces (admin, portal,
 * master-leads, auth, other APIs) off the public domain entirely.
 */
function handleDirectoryHost(req: NextRequest): NextResponse | null {
  if (!DIRECTORY_HOSTS.includes(requestHost(req))) return null

  const { pathname } = req.nextUrl

  // Directory pages/assets and the directory API pass straight through.
  if (
    pathname === '/directory' ||
    pathname.startsWith('/directory/') ||
    pathname.startsWith('/api/directory')
  ) {
    return NextResponse.next()
  }

  // Root-level SEO files map onto the directory's generated ones.
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    const url = req.nextUrl.clone()
    url.pathname = `/directory${pathname}`
    return NextResponse.rewrite(url)
  }

  // Static assets in /public (e.g. /blog/*.jpg, /logo.png) serve as-is —
  // don't nest them under /directory or they'd 404 on the public domain.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next()
  }

  // Everything else that belongs to the internal app is hidden from the
  // public domain.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/master-leads') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api')
  ) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Serve the directory at the domain root; nest any other path under it.
  const url = req.nextUrl.clone()
  url.pathname = pathname === '/' ? '/directory' : `/directory${pathname}`
  return NextResponse.rewrite(url)
}

function redirect301(req: NextRequest, pathname: string, search = ''): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = pathname
  url.search = search
  return NextResponse.redirect(url, 301)
}

/**
 * Permanent redirects from the legacy WordPress directory URLs to their new
 * equivalents, so the old site's SEO and inbound links carry over. Runs on
 * every host, before host routing.
 */
function legacyRedirect(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/'

  // The 6 real shop listings → their new listing pages (slugs match 1:1).
  const shop = path.match(/^\/auto-glass-shop\/([^/]+)$/)
  if (shop) return redirect301(req, `/directory/shop/${shop[1]}`)

  // Legacy SEO content (WordPress) → closest section. New articles now come
  // from the blog, so the informational Q&A pages point there; the programmatic
  // shop/city pages point at the directory home (search + browse).
  if (/^\/auto-glass-repair\/[^/]+$/.test(path)) return redirect301(req, '/blog')
  if (/^\/uncategorized\/[^/]+$/.test(path)) return redirect301(req, '/')

  const map: Record<string, string> = {
    '/listing-category/auto-glass-shop': '/directory',
    '/submit-listing': '/directory/claim',
    '/listing-author': '/directory',
    '/contact': '/directory/claim',
  }
  if (map[path]) return redirect301(req, map[path])

  return null
}

export default function middleware(req: NextRequest) {
  const legacy = legacyRedirect(req)
  if (legacy) return legacy

  const directoryResponse = handleDirectoryHost(req)
  if (directoryResponse) return directoryResponse

  // When content features are disabled (the re-scoped default), short-circuit
  // content-only surfaces so they can't be reached or run. Everything else —
  // leads, Google Ads, portal, call-analysis, webhooks, auth — passes through
  // untouched.
  if (!CONTENT_ENABLED) {
    const { pathname } = req.nextUrl

    if (isContentApiPath(pathname)) {
      return NextResponse.json(
        {
          error: 'Content features are disabled on this deployment.',
          code: 'CONTENT_DISABLED',
        },
        { status: 410 }
      )
    }

    if (isContentPagePath(pathname)) {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
