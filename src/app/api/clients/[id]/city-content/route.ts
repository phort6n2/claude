import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { CITY_CONTENT_MIN_WORDS, countWords } from '@/lib/city-content'
import { locationPages, mergeServiceAreas } from '@/lib/site-locations'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * GET — every city that gets a page, with whatever has been written for it
 * and whether that clears the indexing bar.
 *
 * The list is derived from the same locationPages() the site uses, so the
 * admin can never be editing a city that has no page or missing one that
 * does.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { serviceAreas: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  try {
    const [rows, shops] = await Promise.all([
      prisma.clientCityContent.findMany({ where: { clientId: id } }),
      prisma.clientLocation.findMany({ where: { clientId: id }, select: { city: true } }),
    ])
    const written = new Map(rows.map((row) => [row.city.trim().toLowerCase(), row]))
    const shopCities = new Set(shops.map((s) => s.city.trim().toLowerCase()))
    const areas = mergeServiceAreas(client.serviceAreas || [], shops.map((s) => s.city))

    const cities = locationPages(areas).map((page) => {
      const row = written.get(page.area.trim().toLowerCase())
      const wordCount = countWords(row?.body)
      const hasShop = shopCities.has(page.area.trim().toLowerCase())
      return {
        city: page.area,
        slug: page.slug,
        heading: row?.heading || '',
        body: row?.body || '',
        wordCount,
        hasShop,
        // A shop in the city is unique content by itself — a real address,
        // real hours, its own map.
        indexable: hasShop || wordCount >= CITY_CONTENT_MIN_WORDS,
      }
    })

    return NextResponse.json({ cities, minWords: CITY_CONTENT_MIN_WORDS })
  } catch {
    return NextResponse.json({ cities: [], minWords: CITY_CONTENT_MIN_WORDS, unavailable: true })
  }
}

/** PUT — save one city's copy. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const city = str(body.city)
  if (!city) return NextResponse.json({ error: 'Missing city' }, { status: 400 })

  const heading = str(body.heading) || null
  const text = str(body.body) || null

  try {
    if (!text && !heading) {
      await prisma.clientCityContent.deleteMany({ where: { clientId: id, city } })
    } else {
      await prisma.clientCityContent.upsert({
        where: { clientId_city: { clientId: id, city } },
        update: { heading, body: text },
        create: { clientId: id, city, heading, body: text },
      })
    }
  } catch (error) {
    console.error('Failed to save city content:', error)
    return NextResponse.json(
      {
        error:
          'Could not save. If this is a fresh deploy, the ClientCityContent table may not exist yet — run /api/admin/setup-db.',
      },
      { status: 503 }
    )
  }

  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true, wordCount: countWords(text) })
}
