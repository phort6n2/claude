import { NextResponse } from 'next/server'
import { getShopBySlug, getCityRank } from '@/lib/directory/data'
import { hydrateDirectory } from '@/lib/directory/listings'
import { rankUrl, AGMP_RANK_URL } from '@/lib/directory/agmp'
import { sendLeadEvent } from '@/lib/directory/webhooks'

// "Run my audit" click tracker. Fires a shop.audit_click event at AGMP (so the
// Day 0 nurture can start on intent, even if the shop never submits the audit
// form) and then redirects to the same AGMP /rank URL the CTA would have used.
//
// Fail-safe by design: any problem resolving the shop still redirects to a
// working /rank link, so the funnel never dead-ends on a tracking failure.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = (url.searchParams.get('slug') || '').trim()

  let target = AGMP_RANK_URL
  try {
    if (slug) {
      await hydrateDirectory()
      const shop = getShopBySlug(slug)
      if (shop) {
        const { rank, total } = getCityRank(shop)
        target = rankUrl({ rank, of: total, city: shop.city, shop: shop.name })
        // Best-effort; never blocks the redirect for long (5s timeout inside).
        await sendLeadEvent({
          type: 'shop.audit_click',
          slug: shop.slug,
          name: shop.name,
          email: shop.email || undefined,
          phone: shop.phone || undefined,
          city: shop.city,
          state: shop.state.toUpperCase(),
          website: shop.website || undefined,
          rank,
          total,
        })
      }
    }
  } catch {
    // fall through to the bare /rank link
  }

  return NextResponse.redirect(target, 302)
}
