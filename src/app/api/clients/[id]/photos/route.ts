import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { deleteStoredPhoto, processAndStorePhoto } from '@/lib/photo-upload'
import { mirrorRemoteImage } from '@/lib/photo-mirror'
import { validatePublicUrl } from '@/lib/site-import'

export const dynamic = 'force-dynamic'
// Decoding and re-encoding a camera-sized JPEG is not instant.
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET — the client's photos, in the order the site renders them. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const photos = await prisma.clientSitePhoto
    .findMany({ where: { clientId: id }, orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }] })
    .catch(() => [])
  return NextResponse.json({ photos })
}

/** Append a stored photo to a pool, and return the row. */
async function addPhoto(
  clientId: string,
  url: string,
  alt: string,
  poolValue: string
): Promise<{ id: string; url: string; pool: string; sortOrder: number }> {
  const pool = poolValue === 'BODY' ? 'BODY' : 'GALLERY'
  const last = await prisma.clientSitePhoto.findFirst({
    where: { clientId, pool },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  return prisma.clientSitePhoto.create({
    data: {
      clientId,
      url,
      alt: alt.trim(),
      pool,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
}

/**
 * POST — add one photo, from an uploaded file or a pasted address.
 *
 * multipart/form-data with `file`, or JSON `{ url }`; both take optional
 * `alt` and `pool`.
 *
 * THE PASTED ADDRESS IS COPIED, never referenced. The same reasoning as the
 * logo slots: these addresses are usually on the website this platform is
 * replacing, so a hot-linked photo disappears the week the old host is
 * switched off. It also has to pass through sharp to be resized, stripped of
 * its EXIF — a shop's photos come off a phone, with GPS in them — and stamped
 * with the shop's mark, none of which can happen to a file on somebody else's
 * server.
 *
 * Which is why this REFUSES rather than falling back to the address, where
 * the logo route keeps it with a warning. A logo is the one image whose
 * absence breaks the page, and it is never watermarked; a gallery photo that
 * silently arrives unmarked and pointed at another host is worse than one the
 * operator is told to save and upload.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { slug: true, logoUrl: true, businessName: true, primaryColor: true, accentColor: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const brand = {
    logoUrl: client.logoUrl,
    wordmark: {
      businessName: client.businessName,
      primaryColor: client.primaryColor,
      accentColor: client.accentColor,
    },
  }

  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    const body = await request.json().catch(() => ({}))
    const raw = typeof body.url === 'string' ? body.url.trim() : ''
    if (!raw) return NextResponse.json({ error: 'Paste an image address first.' }, { status: 400 })

    // https-only, no private or link-local hosts. mirrorRemoteImage applies
    // the same guard, but it answers null for every kind of failure — running
    // it here first is what lets a bad address say WHY it was refused instead
    // of joining "could not be copied".
    const safe = validatePublicUrl(raw)
    if (!safe.ok) return NextResponse.json({ error: safe.error }, { status: 400 })

    const stored = await mirrorRemoteImage(safe.url.toString(), client.slug, 'photo', brand)
    if (!stored) {
      return NextResponse.json(
        {
          error:
            `That address could not be copied. It has to answer as an image file under 15 MB — ` +
            `a page that merely SHOWS the photo is not the photo, so open the image itself and ` +
            `copy its address. If it is already on this site's own storage, download it and upload the file.`,
        },
        { status: 400 }
      )
    }

    const photo = await addPhoto(id, stored, String(body.alt || ''), String(body.pool || 'GALLERY'))
    revalidatePath(`/sites/${client.slug}`, 'layout')
    // The mark is applied inside the mirror whenever there is one to apply.
    return NextResponse.json({ photo, watermarked: !!client.logoUrl })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  }

  const result = await processAndStorePhoto({
    file: await file.arrayBuffer(),
    clientSlug: client.slug,
    logoUrl: client.logoUrl,
    wordmark: brand.wordmark,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const photo = await addPhoto(
    id,
    result.photo.url,
    String(form?.get('alt') || ''),
    String(form?.get('pool') || 'GALLERY')
  )

  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ photo, watermarked: result.photo.watermarked })
}

/** DELETE ?photoId=… — remove the row, and the file when we host it. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const photoId = new URL(request.url).searchParams.get('photoId') || ''
  const photo = await prisma.clientSitePhoto.findFirst({ where: { id: photoId, clientId: id } })
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  await deleteStoredPhoto(photo.url)
  await prisma.clientSitePhoto.delete({ where: { id: photo.id } })

  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}

/**
 * PATCH — update the alt text, or promote a photo to the hero slot.
 *
 * The hero is the first GALLERY photo rather than a flag on the row, so
 * "make this the hero" is a reorder: the chosen photo takes position 0 and
 * everything else shifts down. One source of truth for order beats an
 * isHero column that can disagree with it.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const photoId = String(body.photoId || '')
  const photo = await prisma.clientSitePhoto.findFirst({ where: { id: photoId, clientId: id } })
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  if (body.action === 'hero') {
    const pool = photo.pool
    const others = await prisma.clientSitePhoto.findMany({
      where: { clientId: id, pool, NOT: { id: photo.id } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })
    await prisma.$transaction([
      prisma.clientSitePhoto.update({ where: { id: photo.id }, data: { sortOrder: 0 } }),
      ...others.map((row, index) =>
        prisma.clientSitePhoto.update({ where: { id: row.id }, data: { sortOrder: index + 1 } })
      ),
    ])
  } else {
    await prisma.clientSitePhoto.update({
      where: { id: photo.id },
      data: { alt: String(body.alt || '').trim().slice(0, 160) },
    })
  }

  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}
