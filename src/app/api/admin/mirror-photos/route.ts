import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { mirrorRemoteImage } from '@/lib/photo-mirror'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — copy every hot-linked photo and logo onto our own storage.
 *
 * The importer now does this at import time, but the shops already live were
 * imported before that: their sites still serve every photo from whatever CMS
 * they had before, at whatever size was uploaded. This is the one-off that
 * catches up, and it is safe to run again — anything already on Blob is
 * skipped, so a second run is a no-op rather than a duplicate.
 *
 * Deliberately per-client and sequential. Fifteen shops with a dozen photos
 * each is a lot of fetch-and-re-encode, and doing it in one pass would either
 * blow the function budget or hammer a handful of hosts hard enough to look
 * like an attack. Call it with `{ clientId }` to do one shop, or with nothing
 * to do the next shop that still has remote images.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const clientId: string | undefined = body?.clientId

  const clients = await prisma.client
    .findMany({
      where: clientId ? { id: clientId } : { status: 'ACTIVE' },
      select: { id: true, slug: true, businessName: true, logoUrl: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return NextResponse.json({ success: false, message: 'No clients to process.' })
  }

  const report: string[] = []
  let copied = 0
  let failed = 0

  for (const client of clients) {
    const photos = await prisma.clientSitePhoto
      .findMany({ where: { clientId: client.id }, select: { id: true, url: true } })
      .catch(() => [])

    const remote = photos.filter((p) => !p.url.includes('.blob.vercel-storage.com'))
    const logoRemote =
      client.logoUrl && !client.logoUrl.includes('.blob.vercel-storage.com') ? client.logoUrl : null

    if (remote.length === 0 && !logoRemote) continue

    let clientCopied = 0
    for (const photo of remote) {
      const url = await mirrorRemoteImage(photo.url, client.slug)
      if (!url) {
        failed++
        continue
      }
      await prisma.clientSitePhoto.update({ where: { id: photo.id }, data: { url } }).catch(() => {})
      clientCopied++
      copied++
    }

    if (logoRemote) {
      const url = await mirrorRemoteImage(logoRemote, client.slug, 'logo')
      if (url) {
        await prisma.client.update({ where: { id: client.id }, data: { logoUrl: url } }).catch(() => {})
        clientCopied++
        copied++
      } else {
        failed++
      }
    }

    report.push(`${client.businessName}: ${clientCopied} copied`)
    console.warn(`[MirrorPhotos] ${client.businessName} copied ${clientCopied}`)
  }

  return NextResponse.json({
    success: failed === 0,
    copied,
    failed,
    message:
      copied === 0 && failed === 0
        ? 'Nothing to copy — every photo and logo is already on our own storage.'
        : `${copied} image(s) copied onto our storage${failed ? `, ${failed} could not be fetched (their original URL is untouched)` : ''}. ${report.join('; ')}`,
  })
}
