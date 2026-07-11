import { NextResponse, type NextRequest } from 'next/server'
import {
  CONTENT_ENABLED,
  isContentApiPath,
  isContentPagePath,
} from '@/lib/features'

export default function middleware(req: NextRequest) {
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
