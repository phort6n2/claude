import { NextResponse } from 'next/server'
import { getAllShops, citySlug } from '@/lib/directory/data'
import { hydrateDirectory } from '@/lib/directory/listings'
import { getStateShapes, projectPoint, type MapPoint } from '@/lib/directory/usmap'

// Map geometry as a separate fetch rather than page props.
//
// The outlines and pins are ~310 KB. Passing them from a server component would
// put them in the homepage's RSC payload AND its HTML — on the page we just cut
// from 922 KB to 267 KB. As its own cached response the homepage stays light,
// the browser caches it across visits, and it only downloads when someone
// actually scrolls the map into view.
export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET() {
  await hydrateDirectory()
  const shops = getAllShops()

  const counts: Record<string, number> = {}
  for (const s of shops) counts[s.state] = (counts[s.state] ?? 0) + 1

  const points: MapPoint[] = []
  for (const s of shops) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue
    const p = projectPoint(s.lat, s.lng)
    if (!p) continue
    points.push({
      slug: s.slug,
      name: s.name,
      city: s.city,
      citySlug: citySlug(s.city),
      state: s.state,
      x: p[0],
      y: p[1],
    })
  }

  return NextResponse.json(
    { states: getStateShapes(), points, counts },
    {
      headers: {
        // Geometry changes only when listings do. Serve stale while refreshing
        // so a scroll into view never waits on a rebuild.
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
