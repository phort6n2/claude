import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { auth } from '@/lib/auth'
import { getPortalSession } from '@/lib/portal-auth'
import { clientIdFromShareToken } from '@/lib/rank-share-token'
import { staticMapUrl } from '@/lib/rank-map'

export const runtime = 'nodejs'

/**
 * GET — the map background for a client's rank grid.
 *
 * Proxied rather than linked because a Static Maps URL carries the API key
 * in its query string, and an <img src> would hand that key to every
 * visitor. Fetching server-side keeps it where it belongs.
 *
 * Three callers, three ways in: a signed-in client sees their own map, an
 * admin sees any client's, and a share token grants exactly one client's.
 * Authorisation decides WHICH client — never whether the key is exposed.
 *
 * The grid centre never moves, so one image serves every scan a client will
 * ever have. Cached for a week and billed once rather than once per view.
 */
async function resolveClientId(request: NextRequest): Promise<string | null> {
  const token = request.nextUrl.searchParams.get('t')
  if (token) return clientIdFromShareToken(token)

  const requested = request.nextUrl.searchParams.get('client')
  if (requested) {
    // Only an admin may name a client directly.
    const session = await auth()
    return session?.user ? requested : null
  }

  const portal = await getPortalSession()
  return portal?.clientId || null
}

export async function GET(request: NextRequest) {
  const clientId = await resolveClientId(request)
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await prisma.client
    .findUnique({ where: { id: clientId }, select: { latitude: true, longitude: true } })
    .catch(() => null)
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
  if (!apiKey) return NextResponse.json({ error: 'Maps key not configured' }, { status: 503 })

  try {
    const res = await fetch(
      staticMapUrl(
        { latitude: client.latitude, longitude: client.longitude, distance, gridSize },
        apiKey
      ),
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `Static Maps returned ${res.status}. Check the Maps Static API is enabled on this key.` },
        { status: 502 }
      )
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/png',
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not fetch the map' }, { status: 502 })
  }
}
