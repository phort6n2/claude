import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { deleteStoredPhoto, processAndStorePhoto } from '@/lib/photo-upload'

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

/**
 * POST — upload one photo.
 *
 * multipart/form-data with `file`, optional `alt`, optional `pool`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { slug: true, logoUrl: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  }

  const result = await processAndStorePhoto({
    file: await file.arrayBuffer(),
    clientSlug: client.slug,
    logoUrl: client.logoUrl,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const pool = String(form?.get('pool') || 'GALLERY') === 'BODY' ? 'BODY' : 'GALLERY'
  const last = await prisma.clientSitePhoto.findFirst({
    where: { clientId: id, pool },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const photo = await prisma.clientSitePhoto.create({
    data: {
      clientId: id,
      url: result.photo.url,
      alt: String(form?.get('alt') || '').trim(),
      pool,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })

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
