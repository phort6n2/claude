import { put } from '@vercel/blob'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { toBlobBody } from '@/lib/blob-body'

/**
 * Derive the footer's white logo from the header's file, automatically.
 *
 * The footer band is dark, and most shop logos are dark ink on transparency
 * — invisible down there. A first attempt repainted the header logo white in
 * CSS (brightness(0) invert(1)), which was perfect for transparent logos and
 * turned every OPAQUE logo into a blank white rectangle, because the filter
 * cannot know which pixels are background. So the decision moved server-side
 * where the pixels can be read: a logo with real transparency gets a white
 * copy generated once and stored as footerLogoUrl; a logo without alpha is
 * left alone and the footer shows it as-is.
 *
 * Self-guarding and safe to call after any logo save: it does nothing when
 * there is no logo, when a footer logo already exists (an uploaded one is
 * never overwritten — clear the field to re-derive), or when the image is
 * opaque. Failures only log; a logo save must never fail on its footer copy.
 */
export async function deriveFooterLogo(clientId: string): Promise<void> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { slug: true, logoUrl: true, footerLogoUrl: true },
    })
    if (!client?.logoUrl || client.footerLogoUrl) return

    const res = await fetch(client.logoUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return
    const source = Buffer.from(await res.arrayBuffer())
    if (source.byteLength > 8_000_000) return

    const image = sharp(source, { failOn: 'none' })
    const meta = await image.metadata()
    if (!meta.width || !meta.height || !meta.hasAlpha) return

    // An alpha CHANNEL is not transparency — plenty of PNGs carry a fully
    // opaque one. Whitening those produces the same blank rectangle the CSS
    // filter did, so only a logo whose alpha actually varies qualifies.
    const stats = await image.stats()
    const alpha = stats.channels[stats.channels.length - 1]
    if (!alpha || alpha.min >= 250) return

    // White ink on the original alpha: every visible pixel becomes white,
    // the shape stays exactly theirs.
    const alphaChannel = await sharp(source, { failOn: 'none' })
      .ensureAlpha()
      .extractChannel(3)
      .toBuffer()
    const white = await sharp({
      create: {
        width: meta.width,
        height: meta.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .joinChannel(alphaChannel)
      .png({ compressionLevel: 9 })
      .toBuffer()

    const blob = await put(`sites/${client.slug}/footer-logo.png`, toBlobBody(white), {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: true,
    })
    await prisma.client.update({ where: { id: clientId }, data: { footerLogoUrl: blob.url } })
  } catch (err) {
    console.warn('[FooterLogo] could not derive white footer logo:', err)
  }
}
