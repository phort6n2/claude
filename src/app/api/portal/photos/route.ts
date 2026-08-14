import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requirePortalSession } from '@/lib/portal-guard'
import { deleteStoredPhoto, processAndStorePhoto } from '@/lib/photo-upload'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Photo uploads from the client's own portal.
 *
 * Photos are the one part of the site clients genuinely own — their van,
 * their bay, their work — so unlike the layout, they can add and remove them
 * freely. Every upload is watermarked with their logo and scoped to their own
 * client id, taken from the signed session rather than the request body.
 */

/** How many photos one client may host. Enough for a gallery, not a library. */
const MAX_PHOTOS = 24

export async function GET() {
  const guard = await requirePortalSession()
  if ('response' in guard) return guard.response
  const { session } = guard

  const photos = await prisma.clientSitePhoto
    .findMany({
      where: { clientId: session.clientId },
      orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }],
    })
    .catch(() => [])
  return NextResponse.json({ photos, max: MAX_PHOTOS })
}

export async function POST(request: NextRequest) {
  const guard = await requirePortalSession({ mutating: true })
  if ('response' in guard) return guard.response
  const { session } = guard

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { slug: true, logoUrl: true, businessName: true, primaryColor: true, accentColor: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const count = await prisma.clientSitePhoto.count({ where: { clientId: session.clientId } })
  if (count >= MAX_PHOTOS) {
    return NextResponse.json(
      { error: `You have reached ${MAX_PHOTOS} photos. Remove one to add another.` },
      { status: 400 }
    )
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
    wordmark: {
      businessName: client.businessName,
      primaryColor: client.primaryColor,
      accentColor: client.accentColor,
    },
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const last = await prisma.clientSitePhoto.findFirst({
    where: { clientId: session.clientId, pool: 'GALLERY' },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const photo = await prisma.clientSitePhoto.create({
    data: {
      clientId: session.clientId,
      url: result.photo.url,
      alt: String(form?.get('alt') || '').trim().slice(0, 160),
      pool: 'GALLERY',
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })

  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ photo, watermarked: result.photo.watermarked })
}

export async function DELETE(request: NextRequest) {
  const guard = await requirePortalSession({ mutating: true })
  if ('response' in guard) return guard.response
  const { session } = guard

  const photoId = new URL(request.url).searchParams.get('photoId') || ''
  // Scoped by clientId from the session: a photo id from another client's
  // site is simply not found.
  const photo = await prisma.clientSitePhoto.findFirst({
    where: { id: photoId, clientId: session.clientId },
  })
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  await deleteStoredPhoto(photo.url)
  await prisma.clientSitePhoto.delete({ where: { id: photo.id } })

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { slug: true },
  })
  if (client) revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}
