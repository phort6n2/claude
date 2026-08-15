import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { getPortalSession } from '@/lib/portal-auth'
import { staticMapUrl } from '@/lib/rank-map'

export const runtime = 'nodejs'

/**
 * GET — the map background for this client's rank grid.
 *
 * Proxied rather than linked directly because a Static Maps URL carries the
 * API key in the query string; putting that in an <img src> hands the key to
 * every visitor. Fetching server-side keeps it where it belongs.
 *
 * The grid centre never moves, so one image serves every scan this client
 * will ever have — cached hard, and billed once rather than once per view.
 */
export async function GET(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { latitude: true, longitude: true },
  })
  if (!client?.latitude || !client?.longitude) {
    return NextResponse.json({ error: 'No coordinates for this client' }, { status: 404 })
  }

  const gridSize = Number(request.nextUrl.searchParams.get('grid')) || 10
  const distance = Number(request.nextUrl.searchParams.get('distance')) || 500
  if (gridSize < 2 || gridSize > 25 || distance < 50 || distance > 20_000) {
    return NextResponse.json({ error: 'Bad grid parameters' }, { status: 400 })
  }

  const setting = await prisma.setting
    .findUnique({ where: { key: 'GOOGLE_PLACES_API_KEY' } })
    .catch(() => null)
  const apiKey = setting?.encrypted
    ? decrypt(setting.value)
    : setting?.value || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Maps key not configured' }, { status: 503 })
  }

  const url = staticMapUrl(
    { latitude: client.latitude, longitude: client.longitude, distance, gridSize },
    apiKey
  )

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      // Most often the Static Maps API is not enabled on the key, which is a
      // different problem from a missing key and should say so.
      return NextResponse.json(
        { error: `Static Maps returned ${res.status}. Check the Maps Static API is enabled on this key.` },
        { status: 502 }
      )
    }
    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/png',
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not fetch the map' }, { status: 502 })
  }
}
