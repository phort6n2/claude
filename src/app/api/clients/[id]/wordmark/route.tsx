import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { renderWordmarkImage, type WordmarkVariant } from '@/lib/wordmark-image'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

const VARIANTS = new Set<WordmarkVariant>(['light', 'dark', 'mono'])

/**
 * GET — the generated wordmark as a PNG.
 *
 * Public and unauthenticated on purpose: it renders only the business name
 * and brand color, both of which are already on every page of the client's
 * public site, and it needs to be linkable so an admin can hand the file to
 * the shop. `?variant=dark|mono` for dark grounds and photo watermarks.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true, primaryColor: true, accentColor: true },
  })
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = request.nextUrl.searchParams.get('variant') as WordmarkVariant | null
  const variant = raw && VARIANTS.has(raw) ? raw : 'light'

  const image = await renderWordmarkImage({
    businessName: client.businessName,
    primaryColor: client.primaryColor,
    accentColor: client.accentColor,
    variant,
  })
  // Derived entirely from the name and brand color, so it only changes when
  // those do — worth caching hard, with a stale window so a rename doesn't
  // cost anyone a render.
  image.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return image
}
