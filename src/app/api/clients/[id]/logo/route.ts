import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { storeLogoUpload } from '@/lib/photo-upload'
import { mirrorRemoteImage } from '@/lib/photo-mirror'
import { validatePublicUrl } from '@/lib/site-import'

export const dynamic = 'force-dynamic'
// Decoding and re-encoding an image is not instant.
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * The two logo slots.
 *
 * The header draws `logoUrl` on white. The footer draws `footerLogoUrl` on
 * the dark band, falling back to `logoUrl` — so the second slot is only for
 * shops whose logo is dark ink on transparency and disappears down there.
 */
const SLOTS = { header: 'logoUrl', footer: 'footerLogoUrl' } as const
type Slot = keyof typeof SLOTS

function slotOf(value: unknown): Slot | null {
  return value === 'header' || value === 'footer' ? value : null
}

async function apply(clientId: string, slot: Slot, url: string | null) {
  await prisma.client.update({ where: { id: clientId }, data: { [SLOTS[slot]]: url } })
  // A new header logo (or a cleared footer slot) is the moment to derive the
  // footer's white copy — self-guarding, and never overwrites an uploaded
  // footer file. Dynamic import keeps sharp out of this route's module load.
  if ((slot === 'header' && url) || (slot === 'footer' && !url)) {
    const { deriveFooterLogo } = await import('@/lib/footer-logo')
    await deriveFooterLogo(clientId)
  }
}

/**
 * POST — set one slot, from an uploaded file or a pasted URL.
 *
 * multipart/form-data with `file` and `slot`, or JSON `{ slot, url }`.
 *
 * A pasted URL is COPIED to our own storage rather than referenced. Most of
 * these addresses are on the shop's existing website, and this platform is
 * usually replacing that website — hot-linking the logo means it disappears
 * the day the old host is switched off, which is the same week the site goes
 * live. When the copy cannot be made the original is kept and the response
 * says so, because a hot-linked logo beats no logo.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    const slot = slotOf(form?.get('slot'))
    const file = form?.get('file')
    if (!slot) return NextResponse.json({ error: 'Missing slot' }, { status: 400 })
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 })

    const result = await storeLogoUpload({ file: await file.arrayBuffer(), clientSlug: client.slug })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    await apply(id, slot, result.url)
    revalidatePath(`/sites/${client.slug}`, 'layout')
    return NextResponse.json({ ok: true, url: result.url, stored: true })
  }

  const body = await request.json().catch(() => ({}))
  const slot = slotOf(body.slot)
  const raw = typeof body.url === 'string' ? body.url.trim() : ''
  if (!slot) return NextResponse.json({ error: 'Missing slot' }, { status: 400 })
  if (!raw) return NextResponse.json({ error: 'Paste an image address first.' }, { status: 400 })

  // https-only, no private or link-local hosts: this fetches an
  // admin-supplied address from the server, the exact SSRF shape the guard
  // exists for. The URL the guard RETURNS is the one used — it upgrades http
  // to https, and a guard you then bypass is not a guard.
  const safe = validatePublicUrl(raw)
  if (!safe.ok) return NextResponse.json({ error: safe.error }, { status: 400 })

  const mirrored = await mirrorRemoteImage(safe.url.toString(), client.slug, 'logo')
  const url = mirrored || safe.url.toString()
  await apply(id, slot, url)
  revalidatePath(`/sites/${client.slug}`, 'layout')

  return NextResponse.json({
    ok: true,
    url,
    stored: !!mirrored,
    warning: mirrored
      ? undefined
      : `Saved, but it could not be copied to our storage — the site will load it from ${safe.url.hostname}. If that site goes away, so does the logo.`,
  })
}

/** DELETE — clear one slot. The file itself stays; other things may use it. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const slot = slotOf(new URL(request.url).searchParams.get('slot'))
  if (!slot) return NextResponse.json({ error: 'Missing slot' }, { status: 400 })

  await apply(id, slot, null)
  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}
