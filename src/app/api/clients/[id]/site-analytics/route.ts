import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { refreshSiteAnalytics } from '@/lib/site-analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH — associate this client with a GA4 property and a Search Console site.
 *
 * Both values come from the picklist, so neither is typed. That is the point:
 * a mistyped property id does not error, it reports another business's
 * traffic to this one and looks entirely normal doing it.
 *
 * Setting either one refreshes immediately. A page that shows nothing until
 * tomorrow's cron is indistinguishable from a page that is broken, and the
 * refresh is also the only thing that proves the account can actually read
 * the property that was just chosen.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const patch: {
    ga4PropertyId?: string | null
    searchConsoleSiteUrl?: string | null
    brandTerms?: string | null
  } = {}
  if ('ga4PropertyId' in body) {
    const raw = typeof body.ga4PropertyId === 'string' ? body.ga4PropertyId.trim() : ''
    // A GA4 property id is digits. The picklist only ever sends one, so this
    // is about what reaches the Data API in a URL path, not about the UI.
    if (raw && !/^\d{1,20}$/.test(raw)) {
      return NextResponse.json({ error: 'That is not a GA4 property id' }, { status: 400 })
    }
    patch.ga4PropertyId = raw || null
  }
  if ('searchConsoleSiteUrl' in body) {
    const raw =
      typeof body.searchConsoleSiteUrl === 'string' ? body.searchConsoleSiteUrl.trim() : ''
    // Stored VERBATIM — "sc-domain:example.com" and "https://example.com/"
    // are both valid and the API matches the exact string, so tidying either
    // one is how a query comes back empty.
    if (raw && !/^(sc-domain:|https?:\/\/)/.test(raw)) {
      return NextResponse.json({ error: 'That is not a Search Console property' }, { status: 400 })
    }
    patch.searchConsoleSiteUrl = raw || null
  }
  if ('brandTerms' in body) {
    /* STORED AS TYPED TEXT, MATCHED AS PLAIN SUBSTRINGS. The obvious shape
       here is a regular expression, and it is the wrong one: an operator
       typing `(` gets a report that silently stops splitting, and a typed
       pattern is a lot of rope for a field whose whole job is "these words
       mean the shop's own name". Terms are folded to letters and digits and
       compared as substrings — see `isBrandedQuery`. */
    const raw = typeof body.brandTerms === 'string' ? body.brandTerms : ''
    const terms = raw
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50)
    // Empty is meaningful: it hands the split back to the derived default
    // rather than turning it off.
    patch.brandTerms = terms.length ? terms.join('\n') : null
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  try {
    await prisma.client.update({ where: { id }, data: patch })
    /* EVERY RANGE, not just the one about to be refreshed.
       Snapshots are keyed per range and served for six hours without
       re-checking whose property produced them — so correcting a wrongly
       picked property left the other five windows serving ANOTHER
       BUSINESS'S traffic to this client. That is exactly what choosing from
       a picklist instead of typing an id was meant to make impossible,
       arriving through the cache instead. */
    await prisma.siteTrafficSnapshot.deleteMany({ where: { clientId: id } })
  } catch {
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  const result = await refreshSiteAnalytics(id)
  return NextResponse.json({
    ok: true,
    ...patch,
    fetchedAt: result.fetchedAt,
    // Reported, not thrown. The association saved either way, and "saved but
    // Google refused to read it" is the useful thing to tell an operator.
    error: result.error,
    hasTraffic: !!result.traffic,
    hasSearch: !!result.search,
  })
}

/** POST — refresh now, for the "check it" button. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const result = await refreshSiteAnalytics(id)
  return NextResponse.json({
    ok: !result.error,
    fetchedAt: result.fetchedAt,
    error: result.error,
    hasTraffic: !!result.traffic,
    hasSearch: !!result.search,
  })
}
