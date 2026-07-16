import { absoluteUrl } from '@/lib/directory/seo'

// Served at /directory/robots.txt (and at the domain root on the public
// directory host, where middleware rewrites /robots.txt -> /directory/robots.txt).
//
// Next.js only treats a `robots.ts` metadata file as special at the APP ROOT,
// not inside a route segment, so this route handler produces the directory's
// robots.txt explicitly. Allow the public site; keep internal operational areas
// out of the index; point crawlers at the directory sitemap.
export const dynamic = 'force-static'

export function GET(): Response {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /portal',
    'Disallow: /master-leads',
    'Disallow: /directory/manage',
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl('/directory/sitemap.xml')}`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'content-type': 'text/plain' },
  })
}
