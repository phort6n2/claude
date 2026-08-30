import { siteIsLive } from '@/lib/site-preview'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { storeDamagePhoto, MAX_DAMAGE_UPLOAD_BYTES } from '@/lib/photo-upload'
import { decideOrigin, requestHost } from '@/lib/lead-origin-policy'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/widget/photo?client=<slug>
 *
 * A photo of the damage, uploaded from the quote form before it is submitted.
 * Returns a URL the form then sends along with the lead.
 *
 * Uploaded on selection rather than at submit, so the file is already stored
 * by the time somebody presses the button. A form that spends eight seconds
 * uploading after the final click is a form people abandon on the final
 * click, which is the worst possible place to lose them.
 *
 * Same origin rule as the lead webhook, and for the same reason with more at
 * stake: an image endpoint that accepts anything from anywhere is a free
 * image host, and free image hosts get used for things you would not want
 * served from your domain.
 */

const CORS_METHODS = 'POST, OPTIONS'

function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  if (!origin || !allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  const slug = new URL(request.url).searchParams.get('client')
  const decision = await decideOrigin(origin, requestHost(request.headers), slug)
  const headers = corsHeaders(origin, decision.allowed)
  return new NextResponse(null, { status: decision.allowed ? 204 : 403, headers })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const slug = new URL(request.url).searchParams.get('client')
  const decision = await decideOrigin(origin, requestHost(request.headers), slug)
  const headers = corsHeaders(origin, decision.allowed)

  if (!decision.allowed) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 })
  }
  if (!slug) {
    return NextResponse.json({ error: 'Missing client parameter' }, { status: 400, headers })
  }

  const client = await prisma.client
    .findUnique({ where: { slug }, select: { slug: true, status: true } })
    .catch(() => null)
  if (!client || !siteIsLive(client.status)) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404, headers })
  }

  let file: ArrayBuffer
  try {
    const form = await request.formData()
    const entry = form.get('photo')
    if (!entry || typeof entry === 'string') {
      return NextResponse.json({ error: 'No photo was sent.' }, { status: 400, headers })
    }
    if (entry.size > MAX_DAMAGE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'That photo is too large. Please pick one under 12 MB.' },
        { status: 413, headers }
      )
    }
    file = await entry.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400, headers })
  }

  // The Content-Type the browser claims is never consulted — storeDamagePhoto
  // decodes the bytes and rejects anything that is not really an image.
  const stored = await storeDamagePhoto({ file, clientSlug: client.slug })
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: 400, headers })
  }

  return NextResponse.json({ url: stored.url }, { headers })
}
