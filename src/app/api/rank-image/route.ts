import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getPortalSession } from '@/lib/portal-auth'
import { clientIdFromShareToken } from '@/lib/rank-share-token'
import { localDominatorKey, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'

export const runtime = 'nodejs'

/**
 * GET — Local Dominator's rendered heatmap for one stored scan.
 *
 * Their image link does not load from a browser: it is served from their
 * account, so an <img src> pointed straight at it renders broken. Fetching
 * it server-side with the API key fixes that, and has two side benefits —
 * the key never reaches the browser, and the URL cannot leak the account.
 *
 * Authorisation mirrors the map proxy: a signed-in client sees their own, an
 * admin sees any, a share token sees exactly one client's.
 */
async function authorisedClientId(request: NextRequest): Promise<string | null> {
  const token = request.nextUrl.searchParams.get('t')
  if (token) return clientIdFromShareToken(token)

  const requested = request.nextUrl.searchParams.get('client')
  if (requested) {
    const session = await auth()
    return session?.user ? requested : null
  }
  const portal = await getPortalSession()
  return portal?.clientId || null
}

export async function GET(request: NextRequest) {
  const clientId = await authorisedClientId(request)
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scanId = request.nextUrl.searchParams.get('scan')
  if (!scanId) return NextResponse.json({ error: 'scan is required' }, { status: 400 })

  const scan = await prisma.localRankScan
    .findFirst({ where: { id: scanId, clientId }, select: { raw: true } })
    .catch(() => null)
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = readScanRecord((scan.raw || {}) as HeatmapRecord).mapImageUrl
  if (!url) return NextResponse.json({ error: 'No image for this scan' }, { status: 404 })

  try {
    const key = await localDominatorKey()
    // Try authenticated first; some of these links are public and some are
    // not, and a bearer token on a public asset is harmless.
    let res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok && key) {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    }
    if (!res.ok) {
      console.warn(`[LocalRank] heatmap image ${res.status} for scan ${scanId}`)
      return NextResponse.json({ error: `Image fetch returned ${res.status}` }, { status: 502 })
    }
    const type = res.headers.get('content-type') || ''
    if (!type.startsWith('image/')) {
      console.warn(`[LocalRank] heatmap link is not an image (${type}) for scan ${scanId}`)
      return NextResponse.json({ error: `Link returned ${type || 'unknown type'}` }, { status: 502 })
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        'Content-Type': type,
        // A completed scan's image never changes.
        'Cache-Control': 'private, max-age=2592000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not fetch the image' }, { status: 502 })
  }
}
