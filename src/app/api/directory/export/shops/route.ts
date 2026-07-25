import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { getAllShops, getCitySummaries, getShopsByCity } from '@/lib/directory/data'
import { hydrateDirectory } from '@/lib/directory/listings'
import { getPaidFeaturedSlugs } from '@/lib/directory/featured'
import { listClaims } from '@/lib/directory/claims'

// Shop database export — powers AGMP's cold outbound ("you're #X in [City]")
// and their nurture sequences.
//
// SCOPE: business/shop records only. Consumer quote requests are NEVER included
// here — directory inquiries go to the one shop they were sent to and are never
// resold or shared. Don't add lead data to this endpoint.
//
// Auth (any one):
//   • Dedicated export token:  Authorization: Bearer $DIRECTORY_EXPORT_TOKEN  or  ?token=
//   • Vercel Cron:             Authorization: Bearer $CRON_SECRET
//   • Agency console:          admin session cookie / x-upload-secret
//
// ?format=csv for a spreadsheet-friendly dump; JSON by default.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const url = new URL(request.url)
  const bearer = request.headers.get('authorization')
  for (const secret of [process.env.DIRECTORY_EXPORT_TOKEN, process.env.CRON_SECRET]) {
    if (!secret) continue
    if (bearer === `Bearer ${secret}`) return true
    if (url.searchParams.get('token') === secret) return true
  }
  return isAdmin(request)
}

type Tier = 'managed' | 'featured' | 'free'

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await hydrateDirectory()

  // Rank every city once rather than per shop (320+ shops).
  const rankBySlug = new Map<string, { rank: number; total: number }>()
  const seen = new Set<string>()
  for (const summary of getCitySummaries()) {
    const key = `${summary.state}/${summary.citySlug}`
    if (seen.has(key)) continue
    seen.add(key)
    const shops = getShopsByCity(summary.state, summary.city)
    shops.forEach((s, i) => rankBySlug.set(s.slug, { rank: i + 1, total: shops.length }))
  }

  const paid = new Set(await getPaidFeaturedSlugs())
  // Claim submissions carry the owner's real contact details + sales intel,
  // which is exactly what makes outbound land. Newest claim per shop wins.
  const claims = await listClaims()
  const claimBySlug = new Map<string, (typeof claims)[number]>()
  for (const c of claims) {
    const slug = c.existingShopSlug || c.listingSlug
    if (!slug || claimBySlug.has(slug)) continue
    claimBySlug.set(slug, c)
  }

  const rows = getAllShops().map((s) => {
    const position = rankBySlug.get(s.slug)
    const claim = claimBySlug.get(s.slug)
    const tier: Tier = s.client ? 'managed' : s.featured || paid.has(s.slug) ? 'featured' : 'free'
    return {
      slug: s.slug,
      name: s.name,
      city: s.city,
      state: s.state.toUpperCase(),
      phone: s.phone || claim?.phone || '',
      email: s.email || claim?.email || '',
      website: s.website || claim?.website || '',
      services: s.services,
      mobileService: !!s.mobileService,
      rating: s.rating ?? null,
      reviewCount: s.reviewCount ?? null,
      rank: position?.rank ?? null,
      totalInCity: position?.total ?? null,
      claimed: !!s.claimed,
      tier,
      // Sales intel from the claim form (present only if they submitted one).
      contactName: claim?.contactName || '',
      monthlyVolume: claim?.monthlyVolume || '',
      frustration: claim?.frustration || '',
      smsConsent: claim?.smsConsent ?? null,
      wantsMarketingHelp: claim?.wantsMarketingHelp ?? null,
      claimedAt: claim?.createdAt || '',
      listingUrl: `https://windshieldrepairhq.com/directory/shop/${s.slug}`,
    }
  })

  const url = new URL(request.url)
  if (url.searchParams.get('format') === 'csv') {
    const cols = Object.keys(rows[0] ?? { slug: '' })
    const csv = [
      cols.join(','),
      ...rows.map((r) =>
        cols
          .map((c) => {
            const v = (r as Record<string, unknown>)[c]
            return csvEscape(Array.isArray(v) ? v.join('|') : v)
          })
          .join(',')
      ),
    ].join('\n')
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="wrhq-shops.csv"',
      },
    })
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: rows.length,
    note: 'Shop/business records only — consumer quote requests are never included.',
    shops: rows,
  })
}
