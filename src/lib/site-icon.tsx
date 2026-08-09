import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { sitePaletteVars } from '@/lib/site-theme'

/**
 * Renders a client's browser/home-screen icon.
 *
 * When they have uploaded a logo we show it; otherwise we fall back to their
 * initial on their brand color, which still reads as *them* in a crowded tab
 * strip. Shared by the favicon and apple-touch-icon routes so the two can
 * never drift apart.
 */
export async function renderSiteIcon(slug: string, px: number) {
  const client = await prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: { businessName: true, logoUrl: true, primaryColor: true, accentColor: true },
  })

  const palette = sitePaletteVars(client?.primaryColor || null, client?.accentColor || null)
  const brand = palette['--cta']
  const initial = (client?.businessName || '?').trim().charAt(0).toUpperCase()

  // A logo hosted somewhere we don't control can 404, hang, or return
  // something the encoder can't read. None of those should cost the page its
  // icon, so the monogram is always the fallback.
  let logo: string | null = null
  if (client?.logoUrl) {
    try {
      const res = await fetch(client.logoUrl, { signal: AbortSignal.timeout(2500) })
      if (res.ok) logo = client.logoUrl
    } catch {
      logo = null
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: brand,
          color: '#ffffff',
          fontSize: Math.round(px * 0.62),
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={px}
            height={px}
            style={{ width: px, height: px, objectFit: 'contain' }}
          />
        ) : (
          initial
        )}
      </div>
    ),
    { width: px, height: px }
  )
}
