import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { stampWatermark } from '@/lib/photo-upload'
import { toBlobBody } from '@/lib/blob-body'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — put the shop's mark on gallery photos that were imported before the
 * importer stamped them.
 *
 * An uploaded photo has always been watermarked; the importer's mirror only
 * started doing it recently. Every shop whose gallery came off their old site
 * therefore has unmarked photos, and nothing about them will change on its own
 * — the stamp happens once, at the moment a photo is stored.
 *
 * WHICH PHOTOS. Only the ones under `/imported/`, which is exactly the set the
 * mirror wrote without a mark: an uploaded photo lives at `sites/{slug}/…` and
 * is already stamped, and a photo the mirror stamped lives at
 * `/imported-wm/`. So this cannot double-stamp anything, and it can be run
 * twice — the second pass finds nothing, because the first moved each photo it
 * marked to the `-wm` path.
 *
 * The old blob is left in place rather than deleted. If anything downstream
 * still holds the previous URL — a cached page, a social card, a row this pass
 * did not update — a dead image is a worse outcome than an orphaned file, and
 * Storage → orphans already lists those for a deliberate cleanup.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const photos = await prisma.clientSitePhoto
    .findMany({
      where: { url: { contains: '/imported/' } },
      select: { id: true, url: true, clientId: true },
    })
    .catch(() => [])

  const clients = new Map<
    string,
    { slug: string; businessName: string; logoUrl: string | null; primaryColor: string | null; accentColor: string | null }
  >()
  for (const id of new Set(photos.map((p) => p.clientId))) {
    const client = await prisma.client
      .findUnique({
        where: { id },
        select: {
          slug: true,
          businessName: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
        },
      })
      .catch(() => null)
    if (client) clients.set(id, client)
  }

  let stamped = 0
  const failures: Array<{ url: string; reason: string }> = []

  for (const photo of photos) {
    const client = clients.get(photo.clientId)
    if (!client) continue
    try {
      const res = await fetch(photo.url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) {
        failures.push({ url: photo.url, reason: `fetch returned ${res.status}` })
        continue
      }
      const original = Buffer.from(await res.arrayBuffer())
      const meta = await sharp(original).metadata()
      if (!meta.width || !meta.height) {
        failures.push({ url: photo.url, reason: 'not an image we can read' })
        continue
      }
      const marked = await stampWatermark(original, meta.width, meta.height, client.logoUrl, {
        businessName: client.businessName,
        primaryColor: client.primaryColor,
        accentColor: client.accentColor,
      })
      if (marked === original) {
        failures.push({ url: photo.url, reason: 'nothing to stamp with — no logo and no business name' })
        continue
      }
      const blob = await put(
        `sites/${client.slug}/imported-wm/${Date.now()}.jpg`,
        toBlobBody(marked),
        { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true }
      )
      await prisma.clientSitePhoto.update({ where: { id: photo.id }, data: { url: blob.url } })
      stamped += 1
    } catch (err) {
      failures.push({ url: photo.url, reason: err instanceof Error ? err.message : 'failed' })
    }
  }

  return NextResponse.json({
    found: photos.length,
    stamped,
    failures,
    note:
      photos.length === 0
        ? 'No unmarked imported photos. Uploaded photos and anything imported since the mirror started stamping are already marked.'
        : `${stamped} of ${photos.length} imported photos now carry the shop's mark. The previous files are left in storage — Storage → orphans lists them.`,
  })
}
