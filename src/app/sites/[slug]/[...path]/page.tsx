import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { LegalShell } from '@/components/sites/legal'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { normalisePath } from '@/lib/url-parity'
import { keptPagesFor } from '@/lib/site-pages'

export const dynamic = 'force-dynamic'

/**
 * Anything on a client host that is not one of the built-in page types.
 *
 * Three outcomes, in this order:
 *
 * 1. A page this shop kept from their old site → render it.
 * 2. A redirect they set up → permanent redirect to where it went.
 * 3. Neither → 404, exactly as before this route existed.
 *
 * The redirect is a 308, not a 301 — that is what `permanentRedirect` emits.
 * Google treats the two the same for passing ranking; the difference is that
 * 308 also forbids a client turning a POST into a GET, which is stricter and
 * harmless here. Worth writing down because "301" is what everyone says and
 * the log will not agree with them.
 *
 * Pages BEFORE redirects on purpose. If somebody has kept a page at an
 * address, that beats a stale redirect rule pointing the same address
 * somewhere else — the page is the more specific, more recent decision.
 */

interface PageProps {
  params: Promise<{ slug: string; path: string[] }>
}

async function resolve(slug: string, segments: string[]) {
  const path = normalisePath(`/${(segments || []).join('/')}`)
  const client = await prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      status: true,
      businessName: true,
      phone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      googleMapsUrl: true,
      clarityProjectId: true,
    },
  })
  if (!client) return { client: null, path, page: null, redirect: null }

  const [page, redirect] = await Promise.all([
    prisma.clientPage
      .findFirst({ where: { clientId: client.id, path, publishedAt: { not: null } } })
      .catch(() => null),
    prisma.clientRedirect
      .findFirst({ where: { clientId: client.id, fromPath: path } })
      .catch(() => null),
  ])
  return { client, path, page, redirect }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, path } = await params
  const { client, page } = await resolve(slug, path)
  if (!client || !page) return { title: 'Not Found' }
  return {
    title: `${page.title} | ${client.businessName}`,
    description: page.metaDescription || undefined,
    alternates: {
      canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app${page.path}`,
    },
  }
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug, path } = await params
  const { client, page, redirect } = await resolve(slug, path)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  if (page) {
    client.phone = (await withSitePhone(client)).phone
    // The other kept pages, so this one is not a dead end. Itself excluded —
    // a link back to the page you are already on is noise.
    const siblings = (await keptPagesFor(client.id)).filter((p) => p.path !== page.path)
    // Sanitised at render, never trusted as stored: this HTML came off
    // somebody else's website and is served from the shop's own origin.
    const html = sanitizeHtml(page.bodyHtml)
    return (
      <LegalShell
        client={client}
        title={page.title}
        basePath={`/sites/${client.slug}`}
        pages={siblings}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p>This page is being written.</p>
        )}
      </LegalShell>
    )
  }

  if (redirect) permanentRedirect(redirect.toPath)

  notFound()
}
